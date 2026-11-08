import { randomInt } from 'node:crypto';
import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  coffeeContributionPerUnit,
  COFFEE_CODE_PATTERN,
  COFFEE_ORDER_REFERENCE_PATTERN,
  COFFEE_RESERVATION_MINUTES,
  type CoffeeCampaignOption,
  type CoffeeCheckoutInput,
  type CoffeeCheckoutResult,
  type PublicCoffeeOffer,
  type PublicCoffeeOrderStatus,
  type WebhookVerificationContext,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { AuditService } from '../../core/audit/audit.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import {
  assertMercadoPagoSignature,
  mercadoPagoNotificationDataId,
  mercadoPagoNotificationType,
} from '../../core/payments/mercadopago-payment.adapter';
import { PrismaService } from '../../prisma/prisma.service';
import { COFFEE_CODE_ALPHABET } from './coffee-admin.service';
import { CoffeeCheckoutClient } from './coffee-checkout.client';
import { coffeeCampaignOption } from './coffee-lot-approvals';

type Tx = Prisma.TransactionClient;

export interface CoffeeWebhookOutcome {
  applied: boolean;
}

export function newCoffeeReference(): string {
  let tail = '';
  for (let i = 0; i < 24; i++) tail += COFFEE_CODE_ALPHABET[randomInt(COFFEE_CODE_ALPHABET.length)];
  return `cafe-${tail}`;
}

/** Bags of a lot held by OTHER orders: paid, or pending inside their reservation. */
async function unitsHeldByOthers(tx: Tx, lotId: string, exceptOrderId?: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ held: number | null }>>(Prisma.sql`
    SELECT COALESCE(sum(quantity), 0)::int AS held
    FROM coffee_orders
    WHERE lot_id = ${lotId}::uuid
      AND (${exceptOrderId ?? null}::uuid IS NULL OR id <> ${exceptOrderId ?? null}::uuid)
      AND (status = 'paid' OR (status = 'pending' AND reserved_until > now()))`);
  return rows[0]?.held ?? 0;
}

/**
 * Lo público del café: la página del QR, las campañas que el comprador puede
 * elegir, el checkout (aparta las bolsas 15 minutos y abre Mercado Pago con la
 * cuenta de AdoptaFácil), el estado del pedido y la notificación de pago.
 *
 * El stock se protege con un candado de fila sobre el lote: dos compradores a
 * la vez nunca apartan la misma bolsa. Si un pago llega cuando ya no quedan
 * bolsas (p. ej. un PSE aprobado después de la reserva), el pedido queda en
 * `needs_refund`: nunca se sobrevende.
 */
@Injectable()
export class CoffeePublicService {
  private readonly logger = new Logger(CoffeePublicService.name);
  private readonly webBase: string;
  private readonly apiBase: string;
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly checkout: CoffeeCheckoutClient,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    config: ConfigService<Env, true>,
  ) {
    const trim = (url: string) => url.replace(/\/+$/, '');
    this.webBase = trim(config.get('WEB_BASE_URL', { infer: true }) as string);
    this.apiBase = trim(
      (config.get('API_PUBLIC_BASE_URL', { infer: true }) as string | undefined) ??
        (config.get('STORAGE_PUBLIC_BASE_URL', { infer: true }) as string | undefined) ??
        'http://localhost:3000',
    );
    this.webhookSecret = config.get('MERCADOPAGO_WEBHOOK_SECRET', { infer: true }) as
      string | undefined;
  }

  orderLink(reference: string): string {
    return `${this.webBase}/cafe/pedido/${reference}`;
  }

  async offer(code: string, source: 'qr' | 'web'): Promise<PublicCoffeeOffer> {
    if (!COFFEE_CODE_PATTERN.test(code)) throw new NotFoundException('Café no encontrado');
    const rows = await this.prisma.$queryRaw<Array<{ data: PublicCoffeeOffer | null }>>(
      Prisma.sql`SELECT coffee_public_offer(${code}, ${source}) AS data`,
    );
    const data = rows[0]?.data;
    if (!data) throw new NotFoundException('Café no encontrado');
    return data;
  }

  async campaigns(): Promise<CoffeeCampaignOption[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: CoffeeCampaignOption[] }>>(
      Prisma.sql`SELECT coffee_campaign_options() AS data`,
    );
    return rows[0]?.data ?? [];
  }

  async orderStatus(reference: string): Promise<PublicCoffeeOrderStatus> {
    if (!COFFEE_ORDER_REFERENCE_PATTERN.test(reference)) {
      throw new NotFoundException('Pedido no encontrado');
    }
    const rows = await this.prisma.$queryRaw<Array<{ data: PublicCoffeeOrderStatus | null }>>(
      Prisma.sql`SELECT coffee_public_order(${reference}) AS data`,
    );
    const data = rows[0]?.data;
    if (!data) throw new NotFoundException('Pedido no encontrado');
    return data;
  }

  async startCheckout(code: string, input: CoffeeCheckoutInput): Promise<CoffeeCheckoutResult> {
    if (!this.checkout.isConfigured()) {
      throw new ServiceUnavailableException(
        'El pago en línea del café no está disponible por ahora.',
      );
    }
    if (!COFFEE_CODE_PATTERN.test(code)) throw new NotFoundException('Café no encontrado');
    const owners = await this.prisma.$queryRaw<Array<{ owner: string | null }>>(
      Prisma.sql`SELECT coffee_checkout_owner(${code}, ${input.lotId}::uuid) AS owner`,
    );
    const teamId = owners[0]?.owner;
    if (!teamId) {
      throw new ConflictException({
        code: 'LOT_NOT_ON_SALE',
        message: 'Ese lote ya no está a la venta.',
      });
    }

    const reference = newCoffeeReference();
    const order = await this.prisma.withOrgContext(teamId, async (tx) => {
      // La campaña se valida al apartar: si se cerró, el comprador elige otra.
      const campaign = await coffeeCampaignOption(tx, input.campaignId);
      if (!campaign) {
        throw new ConflictException({
          code: 'CAMPAIGN_CLOSED',
          message: 'La campaña que elegiste ya no está activa. Elige otra para tu aporte.',
        });
      }
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM coffee_lots WHERE id = ${input.lotId}::uuid AND status = 'on_sale' FOR UPDATE`,
      );
      if (!locked[0]) {
        throw new ConflictException({
          code: 'LOT_NOT_ON_SALE',
          message: 'Ese lote ya no está a la venta.',
        });
      }
      const lot = await tx.coffeeLot.findUniqueOrThrow({
        where: { id: input.lotId },
        include: { product: { select: { name: true } } },
      });
      const available = lot.stockUnits - (await unitsHeldByOthers(tx, lot.id));
      if (input.quantity > available) {
        throw new ConflictException({
          code: 'OUT_OF_STOCK',
          message:
            available > 0
              ? `Solo quedan ${available} bolsas disponibles en este lote.`
              : 'Este lote se agotó.',
          availableUnits: Math.max(available, 0),
        });
      }
      const perUnit = coffeeContributionPerUnit(
        lot.salePriceCop,
        lot.unitCostCop,
        lot.contributionBps,
      );
      const now = new Date();
      const created = await tx.coffeeOrder.create({
        data: {
          organizationId: teamId,
          lotId: lot.id,
          reference,
          quantity: input.quantity,
          unitPriceCop: lot.salePriceCop,
          shippingFeeCop: lot.shippingFeeCop,
          totalCop: lot.salePriceCop * input.quantity + lot.shippingFeeCop,
          contributionPerUnitCop: perUnit,
          contributionTotalCop: perUnit * input.quantity,
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          campaignOrgName: campaign.organizationName,
          buyerName: input.buyer.fullName.trim(),
          buyerEmail: input.buyer.email.trim().toLowerCase(),
          buyerPhone: input.buyer.phone.trim(),
          shippingAddress: input.buyer.address.trim(),
          shippingCity: input.buyer.city.trim(),
          shippingDepartment: input.buyer.department.trim(),
          privacyAcceptedAt: now,
          reservedUntil: new Date(now.getTime() + COFFEE_RESERVATION_MINUTES * 60_000),
        },
      });
      // Nunca datos del comprador en la bitácora: solo el pedido y la campaña.
      await this.audit.recordWithTx(tx, {
        organizationId: teamId,
        actorUserId: null,
        action: 'coffee.order_reserved',
        entityType: 'coffee_order',
        entityId: created.id,
        metadata: {
          reference,
          lotId: lot.id,
          quantity: input.quantity,
          campaignId: campaign.id,
          suggested: campaign.id === lot.defaultCampaignId,
        },
      });
      return { ...created, productName: lot.product.name, lotCode: lot.lotCode };
    });

    try {
      const pref = await this.checkout.createPreference({
        reference,
        title: `${order.productName} · lote ${order.lotCode}`,
        quantity: order.quantity,
        unitPriceCop: order.unitPriceCop,
        shippingFeeCop: order.shippingFeeCop,
        payerEmail: order.buyerEmail,
        payerName: order.buyerName,
        notificationUrl: `${this.apiBase}/coffee/webhooks/mercadopago?source_news=webhooks`,
        backUrl: this.orderLink(reference),
        expiresAt: order.reservedUntil,
      });
      return {
        reference,
        checkoutUrl: pref.checkoutUrl,
        reservedUntil: order.reservedUntil.toISOString(),
        totalCop: order.totalCop,
      };
    } catch (error) {
      this.logger.error(
        `coffee preference failed reference=${reference}: ${(error as Error).message}`,
      );
      // Libera las bolsas de inmediato.
      await this.prisma.withOrgContext(teamId, (tx) =>
        tx.coffeeOrder.update({ where: { id: order.id }, data: { status: 'cancelled' } }),
      );
      throw new BadGatewayException('No pudimos abrir el pago. Intenta de nuevo en un momento.');
    }
  }

  /**
   * `POST /coffee/webhooks/mercadopago` (público). Verifica la firma, relee el
   * pago con el token de AdoptaFácil y lo aplica una sola vez. Lanza (→ 403)
   * si la firma o la relectura fallan.
   */
  async applyWebhook(
    payload: unknown,
    signature: string,
    context: WebhookVerificationContext = {},
  ): Promise<CoffeeWebhookOutcome> {
    if (!this.checkout.isConfigured()) throw new NotFoundException();
    const type = mercadoPagoNotificationType(payload, context.query);
    if (type !== 'payment') return { applied: false };
    const dataId = mercadoPagoNotificationDataId(payload, context.query);
    assertMercadoPagoSignature(
      this.webhookSecret,
      signature,
      context.headers?.['x-request-id'],
      dataId,
    );

    const payment = await this.checkout.getPayment(dataId as string);
    if (payment.liveMode !== null && payment.liveMode === this.checkout.isTest()) {
      throw new Error(
        'Coffee webhook rejected: payment live_mode does not match MERCADOPAGO_TEST.',
      );
    }
    const reference = payment.externalReference;
    if (!reference || !COFFEE_ORDER_REFERENCE_PATTERN.test(reference)) return { applied: false };
    const owners = await this.prisma.$queryRaw<Array<{ owner: string | null }>>(
      Prisma.sql`SELECT coffee_order_owner(${reference}) AS owner`,
    );
    const teamId = owners[0]?.owner;
    if (!teamId) return { applied: false };

    const outcome = await this.prisma.withOrgContext(teamId, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; lot_id: string }>>(
        Prisma.sql`SELECT id, lot_id FROM coffee_orders WHERE reference = ${reference} FOR UPDATE`,
      );
      if (!locked[0]) return { applied: false as const };
      // Mismo orden de candados que el checkout: primero el lote.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM coffee_lots WHERE id = ${locked[0].lot_id}::uuid FOR UPDATE`,
      );
      const order = await tx.coffeeOrder.findUniqueOrThrow({ where: { id: locked[0].id } });
      const lot = await tx.coffeeLot.findUniqueOrThrow({
        where: { id: order.lotId },
        include: { product: { select: { name: true } } },
      });
      const audit = (action: string, metadata: Record<string, unknown> = {}) =>
        this.audit.recordWithTx(tx, {
          organizationId: teamId,
          actorUserId: null,
          action,
          entityType: 'coffee_order',
          entityId: order.id,
          metadata: { reference, paymentId: payment.id, ...metadata },
        });

      if (payment.status === 'approved') {
        if (
          order.status === 'paid' ||
          order.status === 'needs_refund' ||
          order.status === 'refunded'
        ) {
          return { applied: false as const };
        }
        if (payment.amount !== order.totalCop || payment.currency !== 'COP') {
          this.logger.warn(`coffee payment ${payment.id} does not match order ${reference}`);
          await audit('coffee.order_amount_mismatch', { amount: payment.amount });
          return { applied: false as const };
        }
        const available = lot.stockUnits - (await unitsHeldByOthers(tx, lot.id, order.id));
        const status = order.quantity <= available ? 'paid' : 'needs_refund';
        await tx.coffeeOrder.update({
          where: { id: order.id },
          data: { status, mpPaymentId: payment.id, paidAt: new Date() },
        });
        await audit(status === 'paid' ? 'coffee.order_paid' : 'coffee.order_needs_refund', {
          campaignId: order.campaignId,
          contributionTotalCop: order.contributionTotalCop,
        });
        return {
          applied: true as const,
          notify: status,
          order,
          productName: lot.product.name,
          lotCode: lot.lotCode,
        };
      }
      if (payment.status === 'rejected' || payment.status === 'cancelled') {
        if (order.status !== 'pending') return { applied: false as const };
        await tx.coffeeOrder.update({
          where: { id: order.id },
          data: { status: 'rejected', mpPaymentId: payment.id },
        });
        await audit('coffee.order_rejected');
        return { applied: true as const };
      }
      if (payment.status === 'refunded' || payment.status === 'charged_back') {
        if (order.status !== 'paid' && order.status !== 'needs_refund') {
          return { applied: false as const };
        }
        await tx.coffeeOrder.update({ where: { id: order.id }, data: { status: 'refunded' } });
        await audit('coffee.order_refunded', { from: order.status });
        return { applied: true as const };
      }
      return { applied: false as const };
    });

    if ('notify' in outcome && outcome.notify) {
      if (outcome.notify === 'paid') {
        await this.sendReceipt(teamId, outcome.order, outcome.productName, outcome.lotCode);
      } else {
        await this.sendRefundNotice(outcome.order.buyerEmail, outcome.order.reference);
      }
    }
    return { applied: outcome.applied };
  }

  /**
   * Comprobante al comprador: lo que compró y lo que AdoptaFácil aporta a la
   * campaña que eligió. Es un comprobante de compra, no un certificado de
   * donación (el que dona es AdoptaFácil). Best-effort: nunca tumba el webhook.
   */
  private async sendReceipt(
    teamId: string,
    order: {
      id: string;
      reference: string;
      buyerEmail: string;
      quantity: number;
      totalCop: number;
      contributionTotalCop: number;
      campaignTitle: string;
      campaignOrgName: string;
    },
    productName: string,
    lotCode: string,
  ): Promise<void> {
    const link = this.orderLink(order.reference);
    const money = (n: number) => `$${n.toLocaleString('es-CO')}`;
    try {
      await this.notifications.send({
        to: order.buyerEmail,
        idempotencyKey: `coffee.purchase_receipt:${order.id}`,
        subject: 'Tu compra de café en AdoptaFácil',
        body:
          'Hola,\n\n' +
          `Tu pago fue confirmado: ${order.quantity} × ${productName} (lote ${lotCode}), ` +
          `total ${money(order.totalCop)}.\n\n` +
          `Con esta compra, AdoptaFácil aporta ${money(order.contributionTotalCop)} a la campaña ` +
          `"${order.campaignTitle}" de ${order.campaignOrgName}. El aporte es de AdoptaFácil ` +
          '(20 % del margen bruto de cada bolsa), por eso este correo es tu comprobante de compra ' +
          'y no un certificado de donación.\n\n' +
          `Referencia: ${order.reference}\n${link}\n\n` +
          'Te avisaremos cuando enviemos tu café.',
        template: {
          event: 'coffee.purchase_receipt',
          data: {
            producto: productName,
            lote: lotCode,
            cantidad: order.quantity,
            total: order.totalCop,
            campana: order.campaignTitle,
            organizacion_campana: order.campaignOrgName,
            aporte: order.contributionTotalCop,
            referencia: order.reference,
            enlace: link,
          },
        },
      });
      await this.prisma.withOrgContext(teamId, (tx) =>
        tx.coffeeOrder.update({ where: { id: order.id }, data: { receiptSentAt: new Date() } }),
      );
    } catch (error) {
      this.logger.warn(`coffee receipt failed for ${order.reference}: ${(error as Error).message}`);
    }
  }

  private async sendRefundNotice(email: string, reference: string): Promise<void> {
    try {
      await this.notifications.send({
        to: email,
        idempotencyKey: `coffee.needs_refund:${reference}`,
        subject: 'Tu pago de café llegó cuando ya no quedaban bolsas',
        body:
          'Hola,\n\nTu pago se aprobó cuando las bolsas de este lote ya se habían vendido. ' +
          'Te devolveremos el dinero completo por el mismo medio de pago y te escribiremos ' +
          `para confirmarlo.\n\nReferencia: ${reference}\n${this.orderLink(reference)}`,
      });
    } catch (error) {
      this.logger.warn(`coffee refund notice failed for ${reference}: ${(error as Error).message}`);
    }
  }
}
