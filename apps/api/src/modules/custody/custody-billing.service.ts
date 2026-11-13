import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CUSTODY_CHARGE_CONCEPT_LABELS,
  CUSTODY_DEBT_SEPARATION_NOTICE,
  type CustodyAccountSummary,
  type CustodyAlert,
  type CustodyBalanceLine,
  type CustodyCharge,
  type CustodyChargeStatus,
} from '@adoptafacil/contracts';
import {
  CHARGE_INCLUDE,
  CustodyCoreService,
  type ChargeWithRelations,
  type UploadedFileLike,
} from './custody-core.service';
import {
  buildAccountStatement,
  buildExtensionRecord,
  buildPaymentReceipt,
} from './custody-document-builders';
import { renderCustodyPdf } from './custody-pdf';
import type { ChargeDto, PaymentDto } from './custody.schemas';
import {
  actorNameOf,
  animalCode,
  formatCop,
  formatDateShort,
  fromDbDate,
  orNull,
  toDbDate,
  todayInColombia,
} from './custody.util';

const isLate = (charge: CustodyCharge): boolean =>
  charge.status === 'pending' &&
  (charge.situation === 'overdue' || charge.situation === 'extension_breached');

/**
 * La cuenta del responsable: cobros, pagos, prórrogas y avisos.
 *
 * REGLA DE NEGOCIO: nada de lo que pasa aquí toca la custodia del animal. Un
 * cobro vencido produce un aviso y permite que una persona decida iniciar un
 * procedimiento de cobro; nunca retiene al animal, nunca lo entrega a nadie y
 * nunca cambia su estado. Este servicio no escribe en `animals`,
 * `animal_intakes` ni `custody_releases`.
 */
@Injectable()
export class CustodyBillingService {
  constructor(private readonly core: CustodyCoreService) {}

  private async requireCharge(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<ChargeWithRelations> {
    const row = await tx.custodyCharge.findUnique({ where: { id }, include: CHARGE_INCLUDE });
    if (!row || row.organizationId !== this.core.orgId()) {
      throw new NotFoundException('Cobro no encontrado.');
    }
    return row;
  }

  private async chargeView(tx: Prisma.TransactionClient, id: string): Promise<CustodyCharge> {
    const [charge] = await this.core.listCharges(tx, { id });
    if (!charge) throw new NotFoundException('Cobro no encontrado.');
    return charge;
  }

  // --- Cobros ----------------------------------------------------------------

  async listCharges(
    filter: { animalId?: string; responsibleId?: string; status?: CustodyChargeStatus } = {},
  ): Promise<CustodyCharge[]> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, (tx) =>
      this.core.listCharges(tx, {
        ...(filter.animalId ? { animalId: filter.animalId } : {}),
        ...(filter.responsibleId ? { responsibleId: filter.responsibleId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      }),
    );
  }

  /**
   * Registra un cobro al responsable: la mensualidad, la alimentación o un
   * gasto adicional, con su soporte opcional. Es una cuenta por cobrar, nunca
   * una donación, y no pasa por el libro de donaciones.
   */
  async createCharge(
    actorUserId: string,
    input: ChargeDto,
    file: UploadedFileLike | undefined,
  ): Promise<CustodyCharge> {
    const organizationId = this.core.orgId();
    await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      await this.core.requireAnimal(tx, input.animalId);
      await this.core.requireResponsible(tx, input.responsibleId);
      if (input.contractId) {
        const contract = await tx.custodyContract.findUnique({ where: { id: input.contractId } });
        if (!contract || contract.animalId !== input.animalId) {
          throw new BadRequestException('El contrato no corresponde a este animal.');
        }
      }
    });
    const support = file?.buffer?.length
      ? await this.core.prepareUpload(file, { label: 'El soporte' })
      : null;
    const stored = support
      ? await this.core.saveFile(support.data, support.filename, support.contentType)
      : null;

    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const actorName = await actorNameOf(tx, actorUserId);
      const row = await tx.custodyCharge.create({
        data: {
          organizationId,
          animalId: input.animalId,
          responsibleId: input.responsibleId,
          contractId: input.contractId ?? null,
          concept: input.concept,
          description: input.description,
          amountCop: input.amountCop,
          dueDate: toDbDate(input.dueDate),
          expenseDate: input.expenseDate ? toDbDate(input.expenseDate) : null,
          periodLabel: orNull(input.periodLabel),
          createdByUserId: actorUserId,
        },
      });
      let documentId: string | undefined;
      if (stored) {
        const doc = await this.core.insertDocument(tx, {
          animalId: input.animalId,
          kind: 'expense_support',
          title: `Soporte: ${input.description}`,
          source: 'uploaded',
          file: stored,
          actorUserId,
          actorName,
          chargeId: row.id,
          responsibleId: input.responsibleId,
          documentDate: input.expenseDate ?? null,
        });
        documentId = doc.id;
      }
      await this.core.recordEvent(tx, {
        animalId: input.animalId,
        type: 'charge_created',
        summary: `${CUSTODY_CHARGE_CONCEPT_LABELS[input.concept]}: ${formatCop(input.amountCop)}, vence el ${formatDateShort(input.dueDate)}`,
        detail: input.description,
        documentId,
        refs: { chargeId: row.id },
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.charge_created',
        entityType: 'custody_charge',
        entityId: row.id,
        metadata: {
          animalId: input.animalId,
          concept: input.concept,
          amountCop: input.amountCop,
          dueDate: input.dueDate,
          hasSupport: Boolean(stored),
        },
      });
      return this.chargeView(tx, row.id);
    });
  }

  /** Anula un cobro registrado por error. Con pagos vigentes, primero se anulan. */
  async cancelCharge(actorUserId: string, id: string, reason: string): Promise<CustodyCharge> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await this.requireCharge(tx, id);
      if (row.status === 'cancelled') throw new ConflictException('Este cobro ya está anulado.');
      if (row.payments.some((p) => !p.voidedAt)) {
        throw new ConflictException(
          'Este cobro tiene pagos registrados. Anula primero los pagos si fueron un error.',
        );
      }
      const actorName = await actorNameOf(tx, actorUserId);
      await tx.custodyCharge.update({
        where: { id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledByUserId: actorUserId,
          cancelReason: reason,
        },
      });
      await this.core.recordEvent(tx, {
        animalId: row.animalId,
        type: 'charge_cancelled',
        summary: `Cobro anulado: ${row.description}`,
        detail: reason,
        refs: { chargeId: id },
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.charge_cancelled',
        entityType: 'custody_charge',
        entityId: id,
        metadata: { animalId: row.animalId, amountCop: row.amountCop },
      });
      return this.chargeView(tx, id);
    });
  }

  // --- Prórrogas -------------------------------------------------------------

  /**
   * Prórroga: una decisión de la organización, con nombre de quien la
   * autoriza. Es una fila aparte: la fecha de vencimiento original del cobro
   * no cambia. Queda con su registro en PDF y en el historial.
   */
  async grantExtension(
    actorUserId: string,
    chargeId: string,
    input: { newDueDate: string; reason: string; requestedBy?: string },
  ): Promise<CustodyCharge> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await this.requireCharge(tx, chargeId);
      if (row.status !== 'pending') {
        throw new ConflictException('Solo se concede prórroga a un cobro pendiente.');
      }
      const before = this.core.toCharge(row);
      if (input.newDueDate <= before.effectiveDueDate) {
        throw new BadRequestException(
          `La nueva fecha de compromiso debe ser posterior al ${formatDateShort(before.effectiveDueDate)}, la fecha que rige hoy.`,
        );
      }
      if (input.newDueDate < todayInColombia()) {
        throw new BadRequestException('La nueva fecha de compromiso no puede estar en el pasado.');
      }
      const actorName = await actorNameOf(tx, actorUserId);
      const extension = await tx.custodyChargeExtension.create({
        data: {
          organizationId,
          chargeId,
          previousDueDate: toDbDate(before.effectiveDueDate),
          newDueDate: toDbDate(input.newDueDate),
          reason: input.reason,
          requestedBy: orNull(input.requestedBy),
          authorizedByUserId: actorUserId,
          authorizedByName: actorName,
        },
      });
      const animal = await this.core.requireAnimal(tx, row.animalId);
      const responsible = await this.core.requireResponsible(tx, row.responsibleId);
      const organization = await this.core.loadOrganization(tx);
      const ordinal = row.extensions.length + 1;
      const code = `PRO-${animalCode(chargeId)}-${ordinal}`;
      const pdf = await renderCustodyPdf(
        buildExtensionRecord({
          organization,
          animal: this.core.animalFacts(animal),
          responsible: this.core.toParty(responsible),
          charge: before,
          extension: {
            id: extension.id,
            previousDueDate: before.effectiveDueDate,
            newDueDate: input.newDueDate,
            reason: extension.reason,
            requestedBy: extension.requestedBy ?? undefined,
            authorizedByName: actorName,
            createdAt: extension.createdAt.toISOString(),
          },
          ordinal,
          code,
        }),
      );
      const stored = await this.core.saveFile(pdf, `prorroga-${code}.pdf`, 'application/pdf');
      const doc = await this.core.insertDocument(tx, {
        animalId: row.animalId,
        kind: 'payment_extension',
        title: `Prórroga de pago hasta el ${formatDateShort(input.newDueDate)}`,
        source: 'generated',
        file: stored,
        actorUserId,
        actorName,
        chargeId,
        extensionId: extension.id,
        responsibleId: row.responsibleId,
      });
      await this.core.recordEvent(tx, {
        animalId: row.animalId,
        type: 'extension_granted',
        summary: `Prórroga hasta el ${formatDateShort(input.newDueDate)} autorizada por ${actorName}`,
        detail: input.reason,
        documentId: doc.id,
        refs: { chargeId, extensionId: extension.id },
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.extension_granted',
        entityType: 'custody_charge',
        entityId: chargeId,
        metadata: {
          extensionId: extension.id,
          previousDueDate: before.effectiveDueDate,
          newDueDate: input.newDueDate,
          documentId: doc.id,
        },
      });
      return this.chargeView(tx, chargeId);
    });
  }

  // --- Pagos -----------------------------------------------------------------

  /** Consecutivo de constancias por organización y año: RP-2026-000001. */
  private async nextReceiptNumber(tx: Prisma.TransactionClient): Promise<string> {
    const organizationId = this.core.orgId();
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`custody_receipt:${organizationId}`}))::text AS locked`;
    const prefix = `RP-${todayInColombia().slice(0, 4)}-`;
    const count = await tx.custodyPayment.count({
      where: { organizationId, receiptNumber: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(6, '0')}`;
  }

  /**
   * Registra un pago recibido, con su comprobante opcional, y genera la
   * constancia de recepción de pago (que no es una factura electrónica).
   */
  async registerPayment(
    actorUserId: string,
    chargeId: string,
    input: PaymentDto,
    file: UploadedFileLike | undefined,
  ): Promise<CustodyCharge> {
    const organizationId = this.core.orgId();
    await this.core.prisma.withOrgContext(organizationId, (tx) => this.requireCharge(tx, chargeId));
    const proof = file?.buffer?.length
      ? await this.core.prepareUpload(file, { label: 'El comprobante' })
      : null;
    const storedProof = proof
      ? await this.core.saveFile(proof.data, proof.filename, proof.contentType)
      : null;

    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      // Bloquea el cobro: dos pagos a la vez no pueden pasarse del saldo.
      await tx.$queryRaw`SELECT 1 FROM custody_charges WHERE id = ${chargeId}::uuid FOR UPDATE`;
      const row = await this.requireCharge(tx, chargeId);
      if (row.status === 'cancelled') {
        throw new ConflictException('Este cobro está anulado.');
      }
      const before = this.core.toCharge(row);
      if (before.balanceCop <= 0) {
        throw new ConflictException('Este cobro ya está pagado en su totalidad.');
      }
      if (input.amountCop > before.balanceCop) {
        throw new BadRequestException(
          `El valor recibido supera el saldo del cobro (${formatCop(before.balanceCop)}). Registra el excedente en otro cobro.`,
        );
      }
      const actorName = await actorNameOf(tx, actorUserId);
      const receiptNumber = await this.nextReceiptNumber(tx);
      const payment = await tx.custodyPayment.create({
        data: {
          organizationId,
          chargeId,
          receiptNumber,
          amountCop: input.amountCop,
          paidOn: toDbDate(input.paidOn),
          method: input.method,
          reference: orNull(input.reference),
          notes: orNull(input.notes),
          receivedByUserId: actorUserId,
          receivedByName: actorName,
        },
      });
      const balanceAfterCop = before.balanceCop - input.amountCop;
      if (balanceAfterCop === 0) {
        await tx.custodyCharge.update({ where: { id: chargeId }, data: { status: 'paid' } });
      }
      if (storedProof) {
        await this.core.insertDocument(tx, {
          animalId: row.animalId,
          kind: 'bank_proof',
          title: `Comprobante del pago ${receiptNumber}`,
          source: 'uploaded',
          file: storedProof,
          actorUserId,
          actorName,
          chargeId,
          paymentId: payment.id,
          responsibleId: row.responsibleId,
          documentDate: input.paidOn,
        });
      }
      const animal = await this.core.requireAnimal(tx, row.animalId);
      const responsible = await this.core.requireResponsible(tx, row.responsibleId);
      const organization = await this.core.loadOrganization(tx);
      const pdf = await renderCustodyPdf(
        buildPaymentReceipt({
          organization,
          animal: this.core.animalFacts(animal),
          responsible: this.core.toParty(responsible),
          charge: before,
          payment: {
            receiptNumber,
            amountCop: input.amountCop,
            paidOn: input.paidOn,
            method: input.method,
            reference: payment.reference ?? undefined,
            notes: payment.notes ?? undefined,
            receivedByName: actorName,
          },
          balanceAfterCop,
          hasProof: Boolean(storedProof),
        }),
      );
      const stored = await this.core.saveFile(
        pdf,
        `constancia-${receiptNumber}.pdf`,
        'application/pdf',
      );
      const doc = await this.core.insertDocument(tx, {
        animalId: row.animalId,
        kind: 'payment_receipt',
        title: `Constancia de pago ${receiptNumber}`,
        source: 'generated',
        file: stored,
        actorUserId,
        actorName,
        chargeId,
        paymentId: payment.id,
        responsibleId: row.responsibleId,
        documentDate: input.paidOn,
      });
      await this.core.recordEvent(tx, {
        animalId: row.animalId,
        type: 'payment_received',
        summary: `Pago de ${formatCop(input.amountCop)} recibido (constancia ${receiptNumber})`,
        detail: row.description,
        documentId: doc.id,
        refs: { chargeId, paymentId: payment.id },
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.payment_registered',
        entityType: 'custody_payment',
        entityId: payment.id,
        metadata: {
          chargeId,
          receiptNumber,
          amountCop: input.amountCop,
          method: input.method,
          hasProof: Boolean(storedProof),
          documentId: doc.id,
        },
      });
      return this.chargeView(tx, chargeId);
    });
  }

  /** Anula un pago registrado por error. La constancia emitida se conserva. */
  async voidPayment(
    actorUserId: string,
    paymentId: string,
    reason: string,
  ): Promise<CustodyCharge> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const payment = await tx.custodyPayment.findUnique({
        where: { id: paymentId },
        include: { charge: true },
      });
      if (!payment || payment.organizationId !== organizationId) {
        throw new NotFoundException('Pago no encontrado.');
      }
      if (payment.voidedAt) throw new ConflictException('Este pago ya está anulado.');
      const actorName = await actorNameOf(tx, actorUserId);
      await tx.custodyPayment.update({
        where: { id: paymentId },
        data: { voidedAt: new Date(), voidedByUserId: actorUserId, voidReason: reason },
      });
      if (payment.charge.status === 'paid') {
        await tx.custodyCharge.update({
          where: { id: payment.chargeId },
          data: { status: 'pending' },
        });
      }
      await this.core.recordEvent(tx, {
        animalId: payment.charge.animalId,
        type: 'payment_voided',
        summary: `Pago ${payment.receiptNumber} anulado (${formatCop(payment.amountCop)})`,
        detail: reason,
        refs: { chargeId: payment.chargeId, paymentId },
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.payment_voided',
        entityType: 'custody_payment',
        entityId: paymentId,
        metadata: { chargeId: payment.chargeId, receiptNumber: payment.receiptNumber },
      });
      return this.chargeView(tx, payment.chargeId);
    });
  }

  // --- Procedimiento de cobro -----------------------------------------------

  /**
   * Deja constancia de que UNA PERSONA revisó un cobro vencido y decidió
   * iniciar el procedimiento de cobro. Solo es un registro: no cambia la
   * custodia, no retiene al animal y no lo entrega a nadie. El sistema nunca
   * llama a este método por su cuenta.
   */
  async startCollection(
    actorUserId: string,
    chargeId: string,
    note: string,
  ): Promise<CustodyCharge> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await this.requireCharge(tx, chargeId);
      const view = this.core.toCharge(row);
      if (!isLate(view)) {
        throw new ConflictException(
          'El procedimiento de cobro solo se inicia sobre un cobro vencido y sin pagar.',
        );
      }
      if (row.collectionStartedAt) {
        throw new ConflictException('Este cobro ya tiene un procedimiento de cobro iniciado.');
      }
      const actorName = await actorNameOf(tx, actorUserId);
      await tx.custodyCharge.update({
        where: { id: chargeId },
        data: { collectionStartedAt: new Date(), collectionStartedBy: actorUserId },
      });
      await this.core.recordEvent(tx, {
        animalId: row.animalId,
        type: 'collection_procedure_started',
        summary: `${actorName} revisó el caso e inició el procedimiento de cobro (${formatCop(view.balanceCop)})`,
        detail: `${note}\n\n${CUSTODY_DEBT_SEPARATION_NOTICE}`,
        refs: { chargeId },
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.collection_started',
        entityType: 'custody_charge',
        entityId: chargeId,
        metadata: { humanReviewConfirmed: true, balanceCop: view.balanceCop },
      });
      return this.chargeView(tx, chargeId);
    });
  }

  // --- Avisos y resumen ------------------------------------------------------

  private toAlert(charge: CustodyCharge): CustodyAlert {
    return {
      key: `custody:${charge.id}:${charge.effectiveDueDate}`,
      kind: charge.situation === 'extension_breached' ? 'extension_breached' : 'payment_overdue',
      chargeId: charge.id,
      animalId: charge.animalId,
      animalName: charge.animalName,
      responsibleName: charge.responsibleName,
      description: charge.description,
      balanceCop: charge.balanceCop,
      effectiveDueDate: charge.effectiveDueDate,
      daysOverdue: charge.daysOverdue,
    };
  }

  /**
   * Totales por responsable y por animal, y los avisos de vencimiento. Los
   * avisos se calculan al leer; ningún proceso actúa sobre ellos.
   */
  async summary(): Promise<CustodyAccountSummary> {
    const organizationId = this.core.orgId();
    const charges = await this.core.prisma.withOrgContext(organizationId, (tx) =>
      this.core.listCharges(tx, { status: { not: 'cancelled' } }, 5000),
    );
    const byResponsible = new Map<string, CustodyBalanceLine>();
    const byAnimal = new Map<string, CustodyBalanceLine>();
    const add = (
      map: Map<string, CustodyBalanceLine>,
      id: string,
      name: string,
      c: CustodyCharge,
    ) => {
      const line = map.get(id) ?? {
        id,
        name,
        pendingCop: 0,
        overdueCop: 0,
        paidCop: 0,
        openCharges: 0,
      };
      line.paidCop += c.paidCop;
      if (c.status === 'pending') {
        line.pendingCop += c.balanceCop;
        line.openCharges += 1;
        if (isLate(c)) line.overdueCop += c.balanceCop;
      }
      map.set(id, line);
    };
    for (const charge of charges) {
      add(byResponsible, charge.responsibleId, charge.responsibleName, charge);
      add(byAnimal, charge.animalId, charge.animalName, charge);
    }
    const sort = (lines: Iterable<CustodyBalanceLine>) =>
      [...lines].sort((a, b) => b.pendingCop - a.pendingCop || a.name.localeCompare(b.name, 'es'));
    const responsibles = sort(byResponsible.values());
    return {
      pendingCop: responsibles.reduce((sum, l) => sum + l.pendingCop, 0),
      overdueCop: responsibles.reduce((sum, l) => sum + l.overdueCop, 0),
      paidCop: responsibles.reduce((sum, l) => sum + l.paidCop, 0),
      byResponsible: responsibles,
      byAnimal: sort(byAnimal.values()),
      alerts: charges
        .filter(isLate)
        .map((charge) => this.toAlert(charge))
        .sort((a, b) => b.daysOverdue - a.daysOverdue),
    };
  }

  /** Estado de cuenta de un responsable, en PDF. Se genera al pedirlo. */
  async accountStatement(actorUserId: string, responsibleId: string): Promise<Buffer> {
    const organizationId = this.core.orgId();
    const loaded = await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const responsible = await this.core.requireResponsible(tx, responsibleId);
      const organization = await this.core.loadOrganization(tx);
      const charges = await this.core.listCharges(tx, { responsibleId, status: 'pending' }, 2000);
      return { responsible, organization, charges };
    });
    const pdf = await renderCustodyPdf(
      buildAccountStatement({
        organization: loaded.organization,
        responsible: this.core.toParty(loaded.responsible),
        charges: loaded.charges,
        code: `EC-${animalCode(responsibleId)}-${fromDbDate(new Date()).replace(/-/g, '')}`,
      }),
    );
    await this.core.audit.record({
      organizationId,
      actorUserId,
      action: 'custody.account_statement_generated',
      entityType: 'custody_responsible',
      entityId: responsibleId,
    });
    return pdf;
  }
}
