import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  CUSTODY_CHARGE_CONCEPT_LABELS,
  CUSTODY_ONLINE_PAYMENT_MIN_COP,
  CUSTODY_ONLINE_PAYMENT_PAYER_NOTICE,
  CUSTODY_ONLINE_PAYMENT_TERMS_VERSION,
  type CollectionResult,
  type CustodyOnlinePaymentSettings,
  Role,
  type CustodyPaymentLink,
  type CustodyPublicCheckout,
  type CustodyPublicPayment,
  type CustodyPublicPaymentState,
  type CustodyPublicPaymentStatus,
  type MercadoPagoCollectorCredentials,
  type NormalizedWebhookEvent,
  type PaymentPort,
  type WebhookVerificationContext,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { type InboxNotice, InboxService } from '../../core/notifications/inbox/inbox.service';
import { PAYMENT_PORT } from '../../core/payments/payment.port';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { MercadoPagoConnectionsService } from '../payments/mercadopago-connections.service';
import { CustodyBillingService } from './custody-billing.service';
import { CHARGE_INCLUDE, CustodyCoreService } from './custody-core.service';
import { actorNameOf, formatCop, todayInColombia } from './custody.util';

/** Qué pasó con un aviso de Mercado Pago sobre un pago de guardería. */
export interface CustodyOnlinePaymentOutcome {
  /** La referencia es un pago en línea de guardería (false = no es nuestro). */
  matched: boolean;
  /** Este aviso cambió algo: confirmó el pago o lo revirtió. */
  applied: boolean;
}

const LINK_GONE = 'Este enlace de pago no existe o ya no está vigente.';
const NOT_COLLECTING =
  'Esta organización no está recibiendo pagos en línea en este momento. Escríbele para acordar otro medio de pago.';
/** Dónde ve el equipo la cuenta de custodia (vencimientos y pagos). */
const CUSTODY_HREF = '/organizacion/custodia';
/** Quiénes reciben los avisos de dinero de guardería: los mismos que registran cobros. */
const CUSTODY_MONEY_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/** Resultado de confirmar o revertir, con el aviso que se manda al terminar. */
interface Settled {
  applied: boolean;
  notice?: InboxNotice;
}

/** Nombre que queda en la constancia como quien recibe un pago en línea. */
const ONLINE_RECEIVER = 'Pago en línea (Mercado Pago)';

/**
 * Pago en línea de un cobro de guardería o custodia.
 *
 * CON QUÉ CUENTA: siempre con la cuenta de Mercado Pago de la PROPIA
 * organización, la misma conexión OAuth de donaciones y apadrinamientos
 * (ADR-PAG-003). Nunca con la cuenta de AdoptaFácil (la de planes y café): si
 * la organización no tiene su cuenta conectada, no se cobra. AdoptaFácil no
 * recibe el dinero ni cobra comisión.
 *
 * QUÉ NO ES: no es una donación. No crea filas en `donations`, no emite recibo
 * ni certificado de donación y no entra al libro de donaciones. Vive en la
 * cuenta del responsable, junto a los pagos registrados a mano.
 *
 * APAGADO POR DEFECTO: cada organización lo enciende aceptando, con nombre y
 * fecha, que facturar y responder por IVA y retenciones es asunto suyo.
 *
 * REGLA DE NEGOCIO: como todo en la cuenta, nada de aquí toca la custodia del
 * animal. Pagar o no pagar nunca condiciona su devolución.
 */
@Injectable()
export class CustodyOnlinePaymentsService {
  private readonly logger = new Logger(CustodyOnlinePaymentsService.name);
  private readonly mercadopago: boolean;
  private readonly webBase: string;

  constructor(
    private readonly core: CustodyCoreService,
    private readonly billing: CustodyBillingService,
    private readonly tenant: TenantContextService,
    @Inject(PAYMENT_PORT) private readonly payments: PaymentPort,
    config: ConfigService<Env, true>,
    @Optional() private readonly connections?: MercadoPagoConnectionsService,
    @Optional() private readonly inbox?: InboxService,
  ) {
    this.mercadopago = config.get('PAYMENT_DRIVER', { infer: true }) === 'mercadopago';
    this.webBase = config.get('WEB_BASE_URL', { infer: true }).replace(/\/+$/, '');
  }

  // --- Interruptor de la organización ----------------------------------------

  /** Con Mercado Pago como pasarela, cobrar exige la cuenta conectada y activa. */
  private async canCollect(organizationId: string): Promise<boolean> {
    if (!this.mercadopago) return true;
    return (await this.connections?.hasActiveConnection(organizationId)) === true;
  }

  async getSettings(): Promise<CustodyOnlinePaymentSettings> {
    const organizationId = this.core.orgId();
    const row = await this.core.prisma.withOrgContext(organizationId, (tx) =>
      tx.custodyOnlinePaymentSettings.findUnique({ where: { organizationId } }),
    );
    return {
      enabled: row?.enabled === true,
      canCollect: await this.canCollect(organizationId),
      termsVersion: CUSTODY_ONLINE_PAYMENT_TERMS_VERSION,
      ...(row?.acceptedAt ? { acceptedAt: row.acceptedAt.toISOString() } : {}),
      ...(row?.acceptedByName ? { acceptedByName: row.acceptedByName } : {}),
    };
  }

  /**
   * Enciende o apaga el pago en línea. Encender exige la aceptación expresa y
   * la cuenta de Mercado Pago conectada; queda quién aceptó, cuándo y qué
   * versión del texto. Apagar no borra esa constancia.
   */
  async updateSettings(
    actorUserId: string,
    input: { enabled: boolean; acceptResponsibility?: boolean },
  ): Promise<CustodyOnlinePaymentSettings> {
    const organizationId = this.core.orgId();
    if (input.enabled) {
      if (input.acceptResponsibility !== true) {
        throw new BadRequestException(
          'Para encender el pago en línea debes aceptar que la organización responde por la facturación y los impuestos de estos cobros.',
        );
      }
      if (!(await this.canCollect(organizationId))) {
        throw new ConflictException(
          'Conecta primero la cuenta de Mercado Pago de la organización (Organización, pestaña Pagos). El dinero llega a esa cuenta.',
        );
      }
    }
    await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const acceptance = input.enabled
        ? {
            termsVersion: CUSTODY_ONLINE_PAYMENT_TERMS_VERSION,
            acceptedAt: new Date(),
            acceptedByUserId: actorUserId,
            acceptedByName: await actorNameOf(tx, actorUserId),
          }
        : {};
      await tx.custodyOnlinePaymentSettings.upsert({
        where: { organizationId },
        create: { organizationId, enabled: input.enabled, ...acceptance },
        update: { enabled: input.enabled, ...acceptance },
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: input.enabled
          ? 'custody.online_payments_enabled'
          : 'custody.online_payments_disabled',
        entityType: 'organization',
        entityId: organizationId,
        metadata: input.enabled ? { termsVersion: CUSTODY_ONLINE_PAYMENT_TERMS_VERSION } : {},
      });
    });
    return this.getSettings();
  }

  // --- Enlace de pago de un cobro --------------------------------------------

  private linkUrl(token: string): string {
    return `${this.webBase}/pagar/guarderia/${token}`;
  }

  /**
   * El enlace de pago de un cobro: lo crea la primera vez y después devuelve
   * el mismo. Quien lo recibe paga sin cuenta; el enlace solo deja ver el
   * cobro y pagarlo.
   */
  async paymentLink(actorUserId: string, chargeId: string): Promise<CustodyPaymentLink> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const settings = await tx.custodyOnlinePaymentSettings.findUnique({
        where: { organizationId },
      });
      if (!settings?.enabled) {
        throw new ConflictException(
          'El pago en línea está apagado. Una persona con rol de administración lo enciende en la cuenta de custodia.',
        );
      }
      await tx.$queryRaw`SELECT 1 FROM custody_charges WHERE id = ${chargeId}::uuid FOR UPDATE`;
      const row = await tx.custodyCharge.findUnique({
        where: { id: chargeId },
        include: CHARGE_INCLUDE,
      });
      if (!row || row.organizationId !== organizationId) {
        throw new NotFoundException('Cobro no encontrado.');
      }
      if (row.status !== 'pending' || this.core.toCharge(row).balanceCop <= 0) {
        throw new ConflictException('Solo un cobro pendiente tiene enlace de pago.');
      }
      const existing = await tx.custodyPaymentLink.findFirst({
        where: { chargeId, revokedAt: null },
      });
      if (existing) {
        return {
          chargeId,
          url: this.linkUrl(existing.token),
          createdAt: existing.createdAt.toISOString(),
        };
      }
      const link = await tx.custodyPaymentLink.create({
        data: {
          organizationId,
          chargeId,
          token: randomBytes(32).toString('base64url'),
          createdByUserId: actorUserId,
        },
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.payment_link_created',
        entityType: 'custody_charge',
        entityId: chargeId,
        metadata: { linkId: link.id },
      });
      return { chargeId, url: this.linkUrl(link.token), createdAt: link.createdAt.toISOString() };
    });
  }

  /** Deja sin efecto el enlace vigente de un cobro (por ejemplo, si se envió a quien no era). */
  async revokePaymentLink(actorUserId: string, chargeId: string): Promise<void> {
    const organizationId = this.core.orgId();
    await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const result = await tx.custodyPaymentLink.updateMany({
        where: { organizationId, chargeId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count === 0) return;
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.payment_link_revoked',
        entityType: 'custody_charge',
        entityId: chargeId,
      });
    });
  }

  // --- Página pública de pago (sin sesión) -----------------------------------

  /** A qué organización pertenece un enlace vigente. Un 404 genérico si no hay. */
  private async organizationOfLink(token: string): Promise<string> {
    const rows = await this.core.prisma.$queryRaw<{ organization_id: string | null }[]>(
      Prisma.sql`SELECT custody_payment_link_owner(${token}) AS organization_id`,
    );
    const organizationId = rows[0]?.organization_id;
    if (!organizationId) throw new NotFoundException(LINK_GONE);
    return organizationId;
  }

  private async organizationOfReference(reference: string): Promise<string | null> {
    const rows = await this.core.prisma.$queryRaw<{ organization_id: string | null }[]>(
      Prisma.sql`SELECT custody_online_payment_owner(${reference}) AS organization_id`,
    );
    return rows[0]?.organization_id ?? null;
  }

  /** ¿Esta referencia de Mercado Pago es un pago de guardería? (No es una donación.) */
  async ownsReference(reference: string): Promise<boolean> {
    return (await this.organizationOfReference(reference)) !== null;
  }

  /** Todo lo que corre aquí ve a `organizationId` como su organización. */
  private inOrganization<T>(
    organizationId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.tenant.run({ organizationId }, () =>
      this.core.prisma.withOrgContext(organizationId, fn),
    );
  }

  private async loadPublic(
    tx: Prisma.TransactionClient,
    organizationId: string,
    token: string,
    collecting: boolean,
  ): Promise<{ view: CustodyPublicPayment; linkId: string; chargeId: string }> {
    const link = await tx.custodyPaymentLink.findUnique({ where: { token } });
    if (!link || link.revokedAt || link.organizationId !== organizationId) {
      throw new NotFoundException(LINK_GONE);
    }
    const [charge] = await this.core.listCharges(tx, { id: link.chargeId });
    if (!charge) throw new NotFoundException(LINK_GONE);
    const settings = await tx.custodyOnlinePaymentSettings.findUnique({
      where: { organizationId },
    });
    const organization = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const state: CustodyPublicPaymentState =
      charge.status === 'cancelled'
        ? 'cancelled'
        : charge.status === 'paid' || charge.balanceCop <= 0
          ? 'paid'
          : settings?.enabled && collecting
            ? 'open'
            : 'unavailable';
    return {
      linkId: link.id,
      chargeId: charge.id,
      view: {
        organizationName: organization?.name ?? '',
        animalName: charge.animalName,
        conceptLabel: CUSTODY_CHARGE_CONCEPT_LABELS[charge.concept],
        description: charge.description,
        ...(charge.periodLabel ? { periodLabel: charge.periodLabel } : {}),
        amountCop: charge.amountCop,
        paidCop: charge.paidCop,
        balanceCop: Math.max(0, charge.balanceCop),
        dueDate: charge.effectiveDueDate,
        state,
        minimumCop: Math.min(CUSTODY_ONLINE_PAYMENT_MIN_COP, Math.max(0, charge.balanceCop)),
        notice: CUSTODY_ONLINE_PAYMENT_PAYER_NOTICE,
      },
    };
  }

  /** Lo que ve quien abre el enlace: el cobro y su saldo. Nada del responsable. */
  async getPublic(token: string): Promise<CustodyPublicPayment> {
    const organizationId = await this.organizationOfLink(token);
    const collecting = await this.canCollect(organizationId);
    const { view } = await this.inOrganization(organizationId, (tx) =>
      this.loadPublic(tx, organizationId, token, collecting),
    );
    return view;
  }

  /**
   * Abre el pago en Mercado Pago por todo el saldo o por una parte. La orden
   * se crea con la cuenta de la organización; sin ella no se cobra (jamás con
   * la cuenta de AdoptaFácil).
   */
  async checkout(token: string, input: { amountCop?: number }): Promise<CustodyPublicCheckout> {
    const organizationId = await this.organizationOfLink(token);
    const collecting = await this.canCollect(organizationId);
    const { view, linkId, chargeId } = await this.inOrganization(organizationId, (tx) =>
      this.loadPublic(tx, organizationId, token, collecting),
    );
    if (view.state === 'paid') throw new ConflictException('Este cobro ya está pagado.');
    if (view.state === 'cancelled') throw new ConflictException('Este cobro fue anulado.');
    if (view.state !== 'open') throw new ConflictException(NOT_COLLECTING);
    const amountCop = input.amountCop ?? view.balanceCop;
    if (amountCop > view.balanceCop) {
      throw new BadRequestException(
        `El valor supera el saldo del cobro (${formatCop(view.balanceCop)}).`,
      );
    }
    if (amountCop < view.minimumCop) {
      throw new BadRequestException(`El pago mínimo es de ${formatCop(view.minimumCop)}.`);
    }

    const mercadopagoCollector = this.mercadopago
      ? await this.connections?.resolveCollector(organizationId)
      : undefined;
    if (this.mercadopago && !mercadopagoCollector) throw new ConflictException(NOT_COLLECTING);

    let result: CollectionResult;
    try {
      result = await this.payments.createCollection({
        intendedAmount: amountCop,
        currency: 'COP',
        concept: { kind: 'custody', id: chargeId },
        idempotencyKey: `custody-${randomUUID()}`,
        mercadopagoCollector,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Pago de guardería ${chargeId}: ${(error as Error).message}`);
      throw new ServiceUnavailableException(
        'No pudimos abrir el pago en Mercado Pago. Intenta de nuevo en unos minutos.',
      );
    }
    await this.inOrganization(organizationId, (tx) =>
      tx.custodyOnlinePayment.create({
        data: {
          organizationId,
          chargeId,
          linkId,
          collectionId: result.collectionId,
          amountCop,
        },
      }),
    );
    // Solo el doble de desarrollo y pruebas aprueba al crear; Mercado Pago
    // confirma siempre después, con su aviso.
    if (!this.mercadopago && result.status === 'approved') {
      await this.settle(organizationId, result.collectionId, result.collectionId);
      return { reference: result.collectionId };
    }
    if (!result.paymentLinkUrl) {
      throw new ServiceUnavailableException(
        'No pudimos abrir el pago en Mercado Pago. Intenta de nuevo en unos minutos.',
      );
    }
    return { reference: result.collectionId, checkoutUrl: result.paymentLinkUrl };
  }

  /** Lo que ve quien vuelve de Mercado Pago. Un 404 genérico si la referencia no existe. */
  async publicStatus(reference: string): Promise<CustodyPublicPaymentStatus> {
    const organizationId = await this.organizationOfReference(reference);
    if (!organizationId) throw new NotFoundException('No encontramos este pago.');
    return this.inOrganization(organizationId, async (tx) => {
      const attempt = await tx.custodyOnlinePayment.findUnique({
        where: { collectionId: reference },
        include: {
          payment: { select: { receiptNumber: true } },
          charge: { select: { animal: { select: { name: true } } } },
          organization: { select: { name: true } },
        },
      });
      if (!attempt) throw new NotFoundException('No encontramos este pago.');
      return {
        status: attempt.status === 'mismatch' ? 'review' : (attempt.status as 'pending'),
        amountCop: attempt.amountCop,
        organizationName: attempt.organization.name,
        animalName: attempt.charge.animal.name,
        ...(attempt.status === 'approved' && attempt.payment
          ? { receiptNumber: attempt.payment.receiptNumber }
          : {}),
      };
    });
  }

  // --- Aviso de Mercado Pago -------------------------------------------------

  /**
   * Aviso de una orden de Mercado Pago (una sola URL para toda la aplicación;
   * `DonationsService` entrega aquí las referencias que no son donaciones ni
   * apadrinamientos). Mismas reglas de confianza que una donación: la firma
   * debe verificar, la orden se RELEE con el token de la propia organización
   * (una referencia falsa falla ahí) y el valor, la moneda y la cuenta que
   * recibió deben coincidir con lo que se cobró. Solo entonces se confirma.
   */
  async applyMercadoPagoOrder(
    reference: string,
    payload: unknown,
    signature: string,
    context: WebhookVerificationContext = {},
  ): Promise<CustodyOnlinePaymentOutcome> {
    const organizationId = await this.organizationOfReference(reference);
    if (!organizationId) return { matched: false, applied: false };

    const mercadopagoCollector = await this.connections?.resolveCollector(organizationId);
    let event: NormalizedWebhookEvent;
    try {
      event = await this.payments.verifyAndNormalizeWebhook(payload, signature, {
        ...context,
        mercadopagoCollector,
      });
    } catch (error) {
      this.logger.warn(`Aviso de pago de guardería rechazado: ${(error as Error).message}`);
      throw new ForbiddenException('Webhook verification failed.');
    }
    if (event.collectionId !== reference) return { matched: true, applied: false };
    return this.applyVerifiedEvent(organizationId, reference, event, mercadopagoCollector);
  }

  /**
   * Conciliación (relectura mensual con el token de la organización): aplica a
   * un pago de guardería un pago que Mercado Pago ya reportó, igual que si
   * hubiera llegado su aviso. Cubre el aviso perdido: un pago aprobado que
   * nunca se registró queda registrado aquí, una sola vez. `matched=false` si
   * la referencia no es un pago de guardería de ESTA organización.
   */
  async applyReadBack(
    organizationId: string,
    event: NormalizedWebhookEvent,
    collector: MercadoPagoCollectorCredentials,
  ): Promise<CustodyOnlinePaymentOutcome> {
    const owner = await this.organizationOfReference(event.collectionId);
    if (owner !== organizationId) return { matched: false, applied: false };
    return this.applyVerifiedEvent(organizationId, event.collectionId, event, collector);
  }

  /**
   * Un evento YA verificado (aviso firmado y releído, o relectura directa con
   * el token de la organización): confirma, revierte o deja para revisión.
   */
  private async applyVerifiedEvent(
    organizationId: string,
    reference: string,
    event: NormalizedWebhookEvent,
    mercadopagoCollector: MercadoPagoCollectorCredentials | undefined,
  ): Promise<CustodyOnlinePaymentOutcome> {
    const gatewayPaymentId = event.mercadopagoPayment?.paymentId ?? event.eventId;

    if (event.status === 'voided') {
      const kind = event.mercadopagoPayment?.status === 'charged_back' ? 'chargeback' : 'refund';
      // Auditoría run-4 N1: un aviso de ORDEN (eventId = id de la orden) habla
      // de toda la orden; un pago suelto (relectura) solo revierte si es EL
      // pago que saldó el cobro, nunca un intento hermano de la misma orden.
      const orderLevel = event.eventId !== event.mercadopagoPayment?.paymentId;
      return {
        matched: true,
        applied: await this.reverse(
          organizationId,
          reference,
          kind,
          orderLevel ? undefined : gatewayPaymentId,
        ),
      };
    }
    if (event.status !== 'approved') return { matched: true, applied: false };

    const expected = await this.inOrganization(organizationId, (tx) =>
      tx.custodyOnlinePayment.findUnique({
        where: { collectionId: reference },
        select: { id: true, amountCop: true },
      }),
    );
    const sameAmount = expected !== null && event.amountCharged === expected.amountCop;
    const sameCurrency = !event.currency || event.currency === 'COP';
    const sameAccount =
      !!mercadopagoCollector && event.receiverAccountId === mercadopagoCollector.userId;
    if (!expected || !sameAmount || !sameCurrency || !sameAccount) {
      // Nunca se marca pagado con un dato que no coincide: queda para revisar.
      await this.core.audit.record({
        organizationId,
        actorUserId: null,
        action: 'custody.online_payment_mismatch',
        entityType: 'custody_online_payment',
        entityId: expected?.id ?? organizationId,
        metadata: {
          expectedAmount: expected?.amountCop ?? null,
          reportedAmount: event.amountCharged ?? null,
          currency: event.currency ?? null,
          sameAccount,
        },
      });
      return { matched: true, applied: false };
    }
    return {
      matched: true,
      applied: await this.settle(organizationId, reference, gatewayPaymentId),
    };
  }

  /**
   * Confirma un pago aprobado: lo escribe en la cuenta del responsable con su
   * constancia. Idempotente: el mismo aviso dos veces no paga dos veces. Si el
   * cobro ya no admite ese valor (lo pagaron por otro lado o lo anularon), el
   * dinero SÍ llegó: no se inventa un pago, queda un aviso para que la
   * organización lo revise y devuelva lo que sobre desde su Mercado Pago.
   */
  private async settle(
    organizationId: string,
    reference: string,
    gatewayPaymentId: string,
  ): Promise<boolean> {
    const result = await this.inOrganization(organizationId, async (tx): Promise<Settled> => {
      await tx.$queryRaw`SELECT 1 FROM custody_online_payments WHERE collection_id = ${reference} FOR UPDATE`;
      const attempt = await tx.custodyOnlinePayment.findUnique({
        where: { collectionId: reference },
        include: { link: { select: { createdByUserId: true } } },
      });
      if (!attempt || attempt.status !== 'pending') return { applied: false };

      await tx.$queryRaw`SELECT 1 FROM custody_charges WHERE id = ${attempt.chargeId}::uuid FOR UPDATE`;
      const row = await tx.custodyCharge.findUnique({
        where: { id: attempt.chargeId },
        include: CHARGE_INCLUDE,
      });
      if (!row) return { applied: false };
      const balanceCop = this.core.toCharge(row).balanceCop;
      if (row.status === 'cancelled' || balanceCop < attempt.amountCop) {
        await tx.custodyOnlinePayment.update({
          where: { id: attempt.id },
          data: { status: 'mismatch', gatewayPaymentId, settledAt: new Date() },
        });
        await this.core.recordEvent(tx, {
          animalId: row.animalId,
          type: 'online_payment_review',
          summary: `Llegó un pago en línea de ${formatCop(attempt.amountCop)} que el cobro ya no admite`,
          detail:
            row.status === 'cancelled'
              ? `El cobro "${row.description}" está anulado. El dinero llegó a la cuenta de Mercado Pago de la organización (pago ${gatewayPaymentId}). Revísalo y devuélvelo desde Mercado Pago si no corresponde.`
              : `El saldo del cobro "${row.description}" es ${formatCop(Math.max(0, balanceCop))}. El dinero llegó a la cuenta de Mercado Pago de la organización (pago ${gatewayPaymentId}). Revísalo y devuelve el excedente desde Mercado Pago.`,
          refs: { chargeId: row.id },
          actorUserId: attempt.link.createdByUserId,
          actorName: ONLINE_RECEIVER,
        });
        await this.core.audit.recordWithTx(tx, {
          organizationId,
          actorUserId: null,
          action: 'custody.online_payment_needs_review',
          entityType: 'custody_online_payment',
          entityId: attempt.id,
          metadata: {
            chargeId: row.id,
            amountCop: attempt.amountCop,
            balanceCop,
            chargeStatus: row.status,
          },
        });
        return {
          applied: true,
          notice: {
            kind: 'custody.online_payment_review',
            tone: 'warning',
            title: `Revisa un pago en línea de ${row.animal.name}`,
            body: `Llegó un pago de ${formatCop(attempt.amountCop)} por "${row.description}" que el cobro ya no admite. El dinero está en la cuenta de Mercado Pago de la organización.`,
            href: CUSTODY_HREF,
            dedupeKey: `custody_online_review:${attempt.id}`,
          },
        };
      }

      const written = await this.billing.writePayment(tx, {
        chargeId: attempt.chargeId,
        amountCop: attempt.amountCop,
        paidOn: todayInColombia(),
        method: 'mercadopago',
        reference: gatewayPaymentId,
        actorUserId: attempt.link.createdByUserId,
        actorName: ONLINE_RECEIVER,
        online: true,
      });
      await tx.custodyOnlinePayment.update({
        where: { id: attempt.id },
        data: {
          status: 'approved',
          gatewayPaymentId,
          paymentId: written.paymentId,
          settledAt: new Date(),
        },
      });
      return {
        applied: true,
        notice: {
          kind: 'custody.online_payment_received',
          tone: 'success',
          title: `Pago en línea recibido por ${row.animal.name}`,
          body: `${formatCop(attempt.amountCop)} por "${row.description}" llegaron a la cuenta de Mercado Pago de la organización. La constancia ${written.receiptNumber} quedó en la cuenta del responsable.`,
          href: CUSTODY_HREF,
          dedupeKey: `custody_online_paid:${attempt.id}`,
        },
      };
    });
    await this.notify(organizationId, result.notice);
    return result.applied;
  }

  /**
   * Mercado Pago devolvió el dinero o aceptó un contracargo: el pago se anula
   * y el cobro vuelve a su saldo. La constancia emitida se conserva en el
   * historial, igual que al anular un pago a mano.
   */
  private async reverse(
    organizationId: string,
    reference: string,
    kind: 'refund' | 'chargeback',
    reversedPaymentId?: string,
  ): Promise<boolean> {
    const result = await this.inOrganization(organizationId, async (tx): Promise<Settled> => {
      await tx.$queryRaw`SELECT 1 FROM custody_online_payments WHERE collection_id = ${reference} FOR UPDATE`;
      const attempt = await tx.custodyOnlinePayment.findUnique({
        where: { collectionId: reference },
        include: {
          link: { select: { createdByUserId: true } },
          payment: { select: { id: true, voidedAt: true } },
        },
      });
      if (!attempt || attempt.status !== 'approved' || !attempt.payment) return { applied: false };
      if (
        reversedPaymentId &&
        attempt.gatewayPaymentId &&
        attempt.gatewayPaymentId !== reversedPaymentId
      ) {
        return { applied: false };
      }
      if (!attempt.payment.voidedAt) {
        await this.billing.voidPaymentInTx(tx, {
          paymentId: attempt.payment.id,
          reason:
            kind === 'chargeback'
              ? 'Mercado Pago informó un contracargo de este pago en línea.'
              : 'Mercado Pago informó la devolución de este pago en línea.',
          actorUserId: attempt.link.createdByUserId,
          actorName: 'Mercado Pago',
          online: true,
        });
      }
      await tx.custodyOnlinePayment.update({
        where: { id: attempt.id },
        data: { status: 'reversed', reversalKind: kind, reversedAt: new Date() },
      });
      return {
        applied: true,
        notice: {
          kind: 'custody.online_payment_reversed',
          tone: 'warning',
          title:
            kind === 'chargeback'
              ? 'Contracargo de un pago en línea de guardería'
              : 'Devolución de un pago en línea de guardería',
          body: `Mercado Pago informó ${kind === 'chargeback' ? 'un contracargo' : 'la devolución'} de ${formatCop(attempt.amountCop)}. El pago quedó anulado y el cobro volvió a su saldo.`,
          href: CUSTODY_HREF,
          dedupeKey: `custody_online_reversed:${attempt.id}`,
        },
      };
    });
    await this.notify(organizationId, result.notice);
    return result.applied;
  }

  /**
   * Aviso al equipo que cobra (dueño, administración y operación) después de
   * confirmar la transacción. Si falla, el pago ya quedó registrado igual.
   */
  private async notify(organizationId: string, notice: InboxNotice | undefined): Promise<void> {
    if (!notice || !this.inbox) return;
    await this.inbox.toOrgStaff(organizationId, notice, { roles: CUSTODY_MONEY_ROLES });
  }
}
