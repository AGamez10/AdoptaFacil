import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  ACCOUNTING_ENTRY_TYPE_LABEL,
  ACCOUNTING_DESTINATION_LABEL,
  ACCOUNTING_PERIOD_PATTERN,
  ACCOUNTING_SHARE_DAYS,
  accountingPeriodLabel,
  accountingPeriodOf,
  accountingPeriodRange,
  type AccountingEntry,
  type AccountingOverview,
  type AccountingPeriodClose,
  type AccountingPeriodSummary,
  type AccountingPeriodView,
  type AccountingReconciliation,
  type AccountingShareInfo,
  type AccountingSharePreview,
  type AccountingSyncResult,
  type AccountingTotals,
  type AdditionalSignerRole,
  type CloseAccountingPeriodInput,
  type CloseAccountingPeriodResult,
  type DonationDonor,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import { PlansService } from '../../core/plans/plans.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DonationsService } from '../donations/donations.service';
import { SIGNER_ROLE_LABEL } from '../reports/report-legal-effect';
import type { AccountingReportPayload } from '../reports/report-payloads';
import { ReportsService } from '../reports/reports.service';
import {
  draftsForDonation,
  entriesHash,
  paymentForDonation,
  postingPeriod,
  reconcile,
  totalsOf,
  type DonationSource,
  type GatewayPaymentSource,
  type ReconcileDonation,
} from './accounting-ledger';
import {
  renderAccountingCsv,
  renderAccountingXlsx,
  type AccountingExportInput,
  type DonorIdentity,
} from './accounting-export';

type Tx = Prisma.TransactionClient;
type EntryRow = Prisma.AccountingEntryGetPayload<object>;
type CloseRow = Prisma.AccountingPeriodCloseGetPayload<object>;

const INVALID_SHARE_LINK =
  'Este enlace no es válido, venció o fue revocado. Pide a la organización uno nuevo.';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toEntry(row: EntryRow): AccountingEntry {
  return {
    id: row.id,
    seq: row.seq,
    entryType: row.entryType as AccountingEntry['entryType'],
    source: row.source as AccountingEntry['source'],
    donationId: row.donationId,
    gatewayPaymentId: row.gatewayPaymentId,
    occurredAt: row.occurredAt.toISOString(),
    eventPeriod: row.eventPeriod,
    period: row.period,
    isAdjustment: row.isAdjustment,
    grossCop: Number(row.grossCop),
    feeCop: row.feeCop === null ? null : Number(row.feeCop),
    netCop: row.netCop === null ? null : Number(row.netCop),
    paymentType: row.paymentType,
    paymentMethod: row.paymentMethod,
    destination: row.destination as AccountingEntry['destination'],
    destinationLabel: row.destinationLabel,
    createdAt: row.createdAt.toISOString(),
  };
}

function toClose(row: CloseRow): AccountingPeriodClose {
  return {
    id: row.id,
    period: row.period,
    entryCount: row.entryCount,
    lastSeq: row.lastSeq,
    totals: row.totals as unknown as AccountingTotals,
    reconciliation: row.reconciliation as unknown as AccountingPeriodClose['reconciliation'],
    entriesHash: row.entriesHash,
    note: row.note,
    closedByUserId: row.closedByUserId,
    closedAt: row.closedAt.toISOString(),
  };
}

const decimalToNumber = (d: Prisma.Decimal | null): number | null =>
  d === null ? null : Number(d.toString());

/**
 * Contabilidad de donaciones por detrás (sección 2A). AdoptaFácil PREPARA:
 * libro auxiliar inmutable, conciliación mensual contra la cuenta de Mercado
 * Pago del refugio, cierre de mes y exportes. Nunca firma ni certifica: el
 * libro de un mes cerrado lo revisa y firma el contador o revisor fiscal por
 * el flujo de firma de reportes (enlace de un solo uso, sin cuenta).
 *
 * Cadena de seguridad: JWT + @Roles en el controlador; la organización sale
 * SIEMPRE del contexto de tenant; todo corre en `withOrgContext` bajo RLS. Los
 * enlaces sin sesión se resuelven por la huella del token con una función
 * SECURITY DEFINER que solo devuelve id + organización.
 *
 * El libro se DERIVA de lo ya verificado (donaciones aprobadas + pagos que
 * Mercado Pago confirmó al releerlos con el token del refugio): `sync` crea,
 * de forma idempotente, los renglones que falten. Nunca edita ni borra uno.
 */
@Injectable()
export class AccountingService {
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
    private readonly reports: ReportsService,
    private readonly donations: DonationsService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.webBaseUrl = String(config.get('WEB_BASE_URL') ?? 'http://localhost:5173').replace(
      /\/$/,
      '',
    );
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) throw new ForbiddenException('Missing tenant context');
    return organizationId;
  }

  private assertPeriod(period: string, now = new Date()): void {
    if (!ACCOUNTING_PERIOD_PATTERN.test(period)) {
      throw new BadRequestException('Usa el mes con el formato AAAA-MM.');
    }
    if (period > accountingPeriodOf(now)) {
      throw new BadRequestException('Ese mes todavía no empieza.');
    }
  }

  // -------------------------------------------------------------------------
  // Derivación idempotente del libro
  // -------------------------------------------------------------------------

  /**
   * Crea los renglones que falten para la organización. Un candado por
   * organización (pg_advisory_xact_lock) serializa el folio consecutivo; la
   * unicidad (organización, dedup_key) hace inofensivo un doble intento.
   */
  async sync(organizationId: string, now = new Date()): Promise<number> {
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`accounting:${organizationId}`}, 0))`;
      const [existing, closes, donations, payments] = await Promise.all([
        tx.accountingEntry.findMany({
          where: { organizationId },
          select: { dedupKey: true, seq: true },
        }),
        tx.accountingPeriodClose.findMany({ where: { organizationId }, select: { period: true } }),
        tx.donation.findMany({
          where: { organizationId, status: 'approved' },
          select: {
            id: true,
            collectionId: true,
            amountCharged: true,
            conceptKind: true,
            conceptId: true,
            updatedAt: true,
            receipt: { select: { issuedAt: true } },
          },
        }),
        this.loadPayments(tx, organizationId),
      ]);
      const known = new Set(existing.map((e) => e.dedupKey));
      const closed = new Set(closes.map((c) => c.period));
      let seq = existing.reduce((max, e) => Math.max(max, e.seq), 0);
      const labels = await this.destinationLabels(tx, organizationId, donations);

      const drafts = donations.flatMap((d) => {
        const source: DonationSource = {
          id: d.id,
          collectionId: d.collectionId,
          amountCharged: d.amountCharged,
          conceptKind: d.conceptKind,
          conceptId: d.conceptId,
          approvedAt: d.receipt?.issuedAt ?? d.updatedAt,
          destinationLabel: labels.get(d.conceptId) ?? null,
        };
        return draftsForDonation(source, paymentForDonation(source, payments));
      });
      drafts.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

      let created = 0;
      for (const draft of drafts) {
        if (known.has(draft.dedupKey)) continue;
        const { eventPeriod, period } = postingPeriod(draft.occurredAt, closed, now);
        seq += 1;
        await tx.accountingEntry.create({
          data: {
            organizationId,
            seq,
            dedupKey: draft.dedupKey,
            entryType: draft.entryType,
            source: draft.source,
            donationId: draft.donationId,
            gatewayPaymentId: draft.gatewayPaymentId,
            occurredAt: draft.occurredAt,
            eventPeriod,
            period,
            isAdjustment: period !== eventPeriod,
            grossCop: BigInt(draft.grossCop),
            feeCop: draft.feeCop === null ? null : BigInt(draft.feeCop),
            netCop: draft.netCop === null ? null : BigInt(draft.netCop),
            paymentType: draft.paymentType,
            paymentMethod: draft.paymentMethod,
            destination: draft.destination,
            destinationId: draft.destinationId,
            destinationLabel: draft.destinationLabel,
          },
        });
        known.add(draft.dedupKey);
        created++;
      }
      return created;
    });
  }

  private async loadPayments(tx: Tx, organizationId: string): Promise<GatewayPaymentSource[]> {
    const rows = await tx.mercadoPagoPayment.findMany({ where: { organizationId } });
    return rows.map((p) => ({
      mpPaymentId: p.mpPaymentId,
      externalReference: p.externalReference,
      donationId: p.donationId,
      status: p.status,
      transactionAmount: Number(p.transactionAmount.toString()),
      netReceivedAmount: decimalToNumber(p.netReceivedAmount),
      transactionAmountRefunded: decimalToNumber(p.transactionAmountRefunded),
      feeDetails: p.feeDetails,
      refunds: p.refunds,
      paymentTypeId: p.paymentTypeId,
      paymentMethodId: p.paymentMethodId,
      dateApproved: p.dateApproved,
      firstSeenAt: p.firstSeenAt,
      updatedAt: p.updatedAt,
    }));
  }

  private async destinationLabels(
    tx: Tx,
    organizationId: string,
    donations: Array<{ conceptKind: string; conceptId: string }>,
  ): Promise<Map<string, string>> {
    const campaignIds = donations
      .filter((d) => d.conceptKind === 'campaign')
      .map((d) => d.conceptId);
    const animalIds = donations.filter((d) => d.conceptKind === 'animal').map((d) => d.conceptId);
    const [campaigns, animals] = await Promise.all([
      campaignIds.length
        ? tx.campaign.findMany({
            where: { organizationId, id: { in: campaignIds } },
            select: { id: true, title: true },
          })
        : [],
      animalIds.length
        ? tx.animal.findMany({
            where: { organizationId, id: { in: animalIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    return new Map<string, string>([
      ...campaigns.map((c): [string, string] => [c.id, c.title]),
      ...animals.map((a): [string, string] => [a.id, a.name]),
    ]);
  }

  // -------------------------------------------------------------------------
  // Lecturas
  // -------------------------------------------------------------------------

  async overview(): Promise<AccountingOverview> {
    const organizationId = this.requireOrgId();
    await this.sync(organizationId);
    const [features, data] = await Promise.all([
      this.features(organizationId),
      this.prisma.withOrgContext(organizationId, async (tx) => {
        const [grouped, closes, connection, designations, reps] = await Promise.all([
          tx.accountingEntry.groupBy({
            by: ['period'],
            where: { organizationId },
            _count: { _all: true },
            _sum: { grossCop: true },
          }),
          tx.accountingPeriodClose.findMany({ where: { organizationId } }),
          tx.organizationMercadoPagoConnection.findUnique({
            where: { organizationId },
            select: { status: true },
          }),
          tx.orgSignerDesignation.findMany({
            where: { organizationId, revokedAt: null },
            include: { user: { select: { displayName: true } } },
          }),
          tx.legalRepresentative.findMany({
            where: { organizationId, role: { in: ['accountant', 'fiscal_reviewer'] } },
            select: { role: true, memberId: true },
          }),
        ]);
        return { grouped, closes, connection, designations, reps };
      }),
    ]);
    const current = accountingPeriodOf(new Date());
    const byPeriod = new Map<string, AccountingPeriodSummary>();
    for (const g of data.grouped) {
      byPeriod.set(g.period, {
        period: g.period,
        status: 'open',
        entryCount: g._count._all,
        balanceCop: Number(g._sum.grossCop ?? 0n),
      });
    }
    for (const c of data.closes) {
      const p = byPeriod.get(c.period) ?? {
        period: c.period,
        status: 'open',
        entryCount: 0,
        balanceCop: 0,
      };
      byPeriod.set(c.period, { ...p, status: 'closed', closedAt: c.closedAt.toISOString() });
    }
    if (!byPeriod.has(current)) {
      byPeriod.set(current, { period: current, status: 'open', entryCount: 0, balanceCop: 0 });
    }
    return {
      currentPeriod: current,
      periods: [...byPeriod.values()].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 24),
      mercadopagoConnected: data.connection?.status === 'active',
      features,
      signers: data.designations.map((d) => ({
        role: d.role as AdditionalSignerRole,
        displayName: d.user.displayName,
        signatureRegistered: data.reps.some((r) => r.role === d.role && r.memberId === d.userId),
      })),
    };
  }

  private async features(organizationId: string): Promise<AccountingOverview['features']> {
    const [close, fullExport, accountantPackage] = await Promise.all([
      this.plans.hasCapability(organizationId, 'accountingClose'),
      this.plans.hasCapability(organizationId, 'accountingFullExport'),
      this.plans.hasCapability(organizationId, 'accountantPackage'),
    ]);
    return { close, fullExport, accountantPackage };
  }

  private async loadPeriod(
    tx: Tx,
    organizationId: string,
    period: string,
  ): Promise<{ entries: AccountingEntry[]; close: CloseRow | null }> {
    const [rows, close] = await Promise.all([
      tx.accountingEntry.findMany({ where: { organizationId, period }, orderBy: { seq: 'asc' } }),
      tx.accountingPeriodClose.findUnique({
        where: { organizationId_period: { organizationId, period } },
      }),
    ]);
    return { entries: rows.map(toEntry), close };
  }

  async periodView(period: string): Promise<AccountingPeriodView> {
    const organizationId = this.requireOrgId();
    this.assertPeriod(period);
    await this.sync(organizationId);
    const { entries, close, shares } = await this.prisma.withOrgContext(
      organizationId,
      async (tx) => {
        const loaded = await this.loadPeriod(tx, organizationId, period);
        const shareRows = await tx.accountingShare.findMany({
          where: { organizationId, period },
          include: { signerUser: { select: { displayName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        return { ...loaded, shares: shareRows };
      },
    );
    return {
      period,
      status: close ? 'closed' : 'open',
      ...(close ? { close: toClose(close) } : {}),
      totals: totalsOf(entries),
      entries,
      report: await this.reports.accountingReportFor(organizationId, period),
      shares: shares.map((s): AccountingShareInfo => ({
        id: s.id,
        period: s.period,
        signerRole: s.signerRole as AdditionalSignerRole,
        signerName: s.signerUser.displayName,
        expiresAt: s.expiresAt.toISOString(),
        revokedAt: s.revokedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  }

  async reconciliation(period: string): Promise<AccountingReconciliation> {
    const organizationId = this.requireOrgId();
    this.assertPeriod(period);
    await this.sync(organizationId);
    return this.computeReconciliation(organizationId, period);
  }

  private async computeReconciliation(
    organizationId: string,
    period: string,
  ): Promise<AccountingReconciliation> {
    const { fromUtc, toUtcExclusive } = accountingPeriodRange(period);
    const range = { gte: fromUtc, lt: toUtcExclusive };
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [connection, paymentRows] = await Promise.all([
        tx.organizationMercadoPagoConnection.findUnique({
          where: { organizationId },
          select: { status: true },
        }),
        tx.mercadoPagoPayment.findMany({
          where: {
            organizationId,
            OR: [{ dateApproved: range }, { dateApproved: null, firstSeenAt: range }],
          },
        }),
      ]);
      const payments: GatewayPaymentSource[] = paymentRows.map((p) => ({
        mpPaymentId: p.mpPaymentId,
        externalReference: p.externalReference,
        donationId: p.donationId,
        status: p.status,
        transactionAmount: Number(p.transactionAmount.toString()),
        netReceivedAmount: decimalToNumber(p.netReceivedAmount),
        transactionAmountRefunded: decimalToNumber(p.transactionAmountRefunded),
        feeDetails: p.feeDetails,
        refunds: p.refunds,
        paymentTypeId: p.paymentTypeId,
        paymentMethodId: p.paymentMethodId,
        dateApproved: p.dateApproved,
        firstSeenAt: p.firstSeenAt,
        updatedAt: p.updatedAt,
      }));
      const references = payments.map((p) => p.externalReference);
      const donationRows = await tx.donation.findMany({
        where: {
          organizationId,
          collectionId: { startsWith: 'af-' },
          OR: [
            { status: 'approved', receipt: { issuedAt: range } },
            { collectionId: { in: references } },
          ],
        },
        select: {
          id: true,
          collectionId: true,
          status: true,
          amountCharged: true,
          createdAt: true,
          receipt: { select: { issuedAt: true } },
        },
      });
      const reversals = await tx.accountingEntry.groupBy({
        by: ['donationId'],
        where: {
          organizationId,
          donationId: { in: donationRows.map((d) => d.id) },
          entryType: { in: ['refund', 'chargeback'] },
        },
        _sum: { grossCop: true },
      });
      const reversed = new Map(reversals.map((r) => [r.donationId, Number(r._sum.grossCop ?? 0n)]));
      const donations: ReconcileDonation[] = donationRows.map((d) => ({
        id: d.id,
        collectionId: d.collectionId,
        status: d.status,
        amountCharged: d.amountCharged,
        at: d.receipt?.issuedAt ?? d.createdAt,
        reversedCop: reversed.get(d.id) ?? 0,
      }));
      const result = reconcile(donations, payments);
      const lastRead = paymentRows.reduce<Date | null>(
        (max, p) => (!max || p.updatedAt > max ? p.updatedAt : max),
        null,
      );
      const discrepancies =
        result.counts.missing_in_gateway +
        result.counts.missing_in_platform +
        result.counts.status_mismatch +
        result.counts.amount_mismatch;
      return {
        period,
        mercadopagoConnected: connection?.status === 'active',
        counts: result.counts,
        platformTotalCop: result.platformTotalCop,
        gatewayTotalCop: result.gatewayTotalCop,
        gatewayFeesCop: result.gatewayFeesCop,
        gatewayNetCop: result.gatewayNetCop,
        differenceCop: result.platformTotalCop - result.gatewayTotalCop,
        balanced: discrepancies === 0,
        lines: result.lines,
        lastGatewayReadAt: lastRead?.toISOString() ?? null,
      };
    });
  }

  /** Relee Mercado Pago para el mes (recupera notificaciones perdidas). */
  async reread(period: string, actorUserId: string): Promise<AccountingSyncResult> {
    const organizationId = this.requireOrgId();
    this.assertPeriod(period);
    const { fromUtc, toUtcExclusive } = accountingPeriodRange(period);
    const { fetched, settled } = await this.donations.rereadMercadoPagoPayments(
      organizationId,
      fromUtc,
      toUtcExclusive,
    );
    const entriesCreated = await this.sync(organizationId);
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'accounting.gateway_reread',
      entityType: 'accounting_period',
      entityId: null,
      metadata: { period, fetched, settled, entriesCreated },
    });
    return { fetched, settled, entriesCreated };
  }

  // -------------------------------------------------------------------------
  // Cierre de mes (plan de pago)
  // -------------------------------------------------------------------------

  async close(
    period: string,
    actorUserId: string,
    input: CloseAccountingPeriodInput,
  ): Promise<CloseAccountingPeriodResult> {
    const organizationId = this.requireOrgId();
    this.assertPeriod(period);
    const now = new Date();
    if (period >= accountingPeriodOf(now)) {
      throw new BadRequestException('Solo se puede cerrar un mes que ya terminó.');
    }
    await this.sync(organizationId, now);
    const rec = await this.computeReconciliation(organizationId, period);
    if (!rec.balanced && input.acknowledgeDiscrepancies !== true) {
      throw new ConflictException(
        'La conciliación de este mes tiene descuadres. Resuélvelos o confirma que cierras sabiéndolo (y explica en la nota).',
      );
    }

    const close = await this.prisma.withOrgContext(organizationId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`accounting:${organizationId}`}, 0))`;
      const already = await tx.accountingPeriodClose.findUnique({
        where: { organizationId_period: { organizationId, period } },
      });
      if (already) throw new ConflictException('Este mes ya está cerrado.');
      const { entries } = await this.loadPeriod(tx, organizationId, period);
      const totals = totalsOf(entries);
      const created = await tx.accountingPeriodClose.create({
        data: {
          organizationId,
          period,
          entryCount: entries.length,
          lastSeq: entries.reduce((m, e) => Math.max(m, e.seq), 0),
          totals: totals as unknown as Prisma.InputJsonValue,
          reconciliation: {
            balanced: rec.balanced,
            counts: rec.counts,
          } as unknown as Prisma.InputJsonValue,
          entriesHash: entriesHash(entries),
          note: input.note?.trim() || null,
          closedByUserId: actorUserId,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'accounting.period_closed',
        entityType: 'accounting_period_close',
        entityId: created.id,
        metadata: {
          period,
          entryCount: created.entryCount,
          entriesHash: created.entriesHash,
          balanced: rec.balanced,
          acknowledgedDiscrepancies: !rec.balanced,
        },
      });
      return { row: created, entries, totals };
    });

    let report: CloseAccountingPeriodResult['report'] = null;
    if (await this.plans.hasCapability(organizationId, 'accountantPackage')) {
      const generated = await this.reports.generateAccounting(actorUserId, period, {
        version: 1,
        kind: 'accounting',
        month: period,
        rows: close.entries.map((e) => ({
          seq: e.seq,
          occurredAt: e.occurredAt,
          type: ACCOUNTING_ENTRY_TYPE_LABEL[e.entryType],
          destination: e.destinationLabel
            ? `${ACCOUNTING_DESTINATION_LABEL[e.destination]}: ${e.destinationLabel}`
            : ACCOUNTING_DESTINATION_LABEL[e.destination],
          paymentType: e.paymentType ?? '',
          gatewayPaymentId: e.gatewayPaymentId ?? '',
          gross: e.grossCop,
          fee: e.feeCop,
          net: e.netCop,
          adjustment: e.isAdjustment ? `Ajuste de ${e.eventPeriod}` : '',
        })),
        totals: close.totals,
        reconciliation: { balanced: rec.balanced, counts: rec.counts },
        close: {
          closedAt: close.row.closedAt.toISOString(),
          entriesHash: close.row.entriesHash,
          lastSeq: close.row.lastSeq,
          note: close.row.note,
        },
      } satisfies Omit<AccountingReportPayload, 'organization' | 'period'>);
      report = { id: generated.id, code: generated.code, status: generated.status ?? 'issued' };
    }
    return { close: toClose(close.row), report };
  }

  // -------------------------------------------------------------------------
  // Exportes
  // -------------------------------------------------------------------------

  private async exportInput(
    organizationId: string,
    period: string,
    full: boolean,
  ): Promise<AccountingExportInput> {
    const reconciliation = full
      ? await this.computeReconciliation(organizationId, period)
      : undefined;
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [{ entries, close }, org, profile] = await Promise.all([
        this.loadPeriod(tx, organizationId, period),
        tx.organization.findUniqueOrThrow({ where: { id: organizationId } }),
        tx.organizationProfile.findUnique({ where: { organizationId } }),
      ]);
      const donors = full ? await this.authorizedDonors(tx, organizationId, entries) : undefined;
      return {
        organizationName: org.name,
        nit: profile?.nit ?? null,
        period,
        status: close ? 'closed' : 'open',
        closedAt: close?.closedAt.toISOString() ?? null,
        entriesHash: close?.entriesHash ?? null,
        entries,
        totals: totalsOf(entries),
        reconciliation,
        donors,
        generatedAt: new Date(),
      };
    });
  }

  /**
   * Identidad del donante SOLO si autorizó a esta organización a identificarlo
   * (`org_report_identification`, vigente) y no donó como anónimo. El resto
   * figura como "Donante" (Ley 1581; ⚖️ confirmar si el contador puede recibir
   * más datos por obligación legal de la organización).
   */
  private async authorizedDonors(
    tx: Tx,
    organizationId: string,
    entries: AccountingEntry[],
  ): Promise<Map<string, DonorIdentity>> {
    const ids = [...new Set(entries.map((e) => e.donationId).filter((x): x is string => !!x))];
    if (ids.length === 0) return new Map();
    const [donations, consents] = await Promise.all([
      tx.donation.findMany({
        where: { organizationId, id: { in: ids } },
        select: { id: true, donorUserId: true, anonymous: true, payer: true },
      }),
      tx.thirdPartyConsent.findMany({
        where: { organizationId, purpose: 'org_report_identification', revokedAt: null },
        select: { subjectUserId: true },
      }),
    ]);
    const consented = new Set(consents.map((c) => c.subjectUserId));
    const out = new Map<string, DonorIdentity>();
    for (const d of donations) {
      if (d.anonymous || !d.donorUserId || !consented.has(d.donorUserId)) continue;
      const payer = (d.payer ?? {}) as DonationDonor;
      if (!payer.fullName && !payer.documentId) continue;
      out.set(d.id, { name: payer.fullName ?? '', document: payer.documentId ?? '' });
    }
    return out;
  }

  async export(
    period: string,
    format: 'csv' | 'xlsx',
    detail: 'basic' | 'full',
    actorUserId: string,
  ): Promise<{ filename: string; data: Buffer; contentType: string }> {
    const organizationId = this.requireOrgId();
    this.assertPeriod(period);
    const full = detail === 'full';
    if (full) await this.plans.assertCapability(organizationId, 'accountingFullExport');
    await this.sync(organizationId);
    const input = await this.exportInput(organizationId, period, full);
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'accounting.exported',
      entityType: 'accounting_period',
      entityId: null,
      metadata: { period, format, detail, rows: input.entries.length },
    });
    return this.file(input, format, full);
  }

  private async file(
    input: AccountingExportInput,
    format: 'csv' | 'xlsx',
    full: boolean,
  ): Promise<{ filename: string; data: Buffer; contentType: string }> {
    const suffix = full ? 'completo' : 'basico';
    if (format === 'csv') {
      return {
        filename: `libro-donaciones-${input.period}-${suffix}.csv`,
        data: renderAccountingCsv(input, full),
        contentType: 'text/csv; charset=utf-8',
      };
    }
    return {
      filename: `libro-donaciones-${input.period}-${suffix}.xlsx`,
      data: await renderAccountingXlsx(input, full),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  // -------------------------------------------------------------------------
  // Compartir con el contador / revisor fiscal (plan de pago)
  // -------------------------------------------------------------------------

  async createShare(
    period: string,
    actorUserId: string,
    signerRole: AdditionalSignerRole,
  ): Promise<AccountingShareInfo> {
    const organizationId = this.requireOrgId();
    this.assertPeriod(period);
    await this.plans.assertCapability(organizationId, 'accountantPackage');
    const token = randomBytes(32).toString('base64url');
    const { share, email, orgName, signerName } = await this.prisma.withOrgContext(
      organizationId,
      async (tx) => {
        const designation = await tx.orgSignerDesignation.findFirst({
          where: { organizationId, role: signerRole, revokedAt: null },
          include: { user: { select: { email: true, displayName: true } } },
        });
        if (!designation) {
          throw new ConflictException(
            `Primero vincula a tu ${SIGNER_ROLE_LABEL[signerRole].toLowerCase()} en Organización → Firmantes.`,
          );
        }
        const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
        const share = await tx.accountingShare.create({
          data: {
            organizationId,
            period,
            signerUserId: designation.userId,
            signerRole,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + ACCOUNTING_SHARE_DAYS * 86_400_000),
            createdByUserId: actorUserId,
          },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'accounting.shared',
          entityType: 'accounting_share',
          entityId: share.id,
          metadata: { period, signerRole, signerUserId: designation.userId },
        });
        return {
          share,
          email: designation.user.email,
          orgName: org.name,
          signerName: designation.user.displayName,
        };
      },
    );
    await this.notifications
      .send({
        to: email,
        subject: `${orgName} te compartió su contabilidad de donaciones de ${accountingPeriodLabel(period)}`,
        body:
          `Hola ${signerName},\n\n` +
          `${orgName} te compartió, como su ${SIGNER_ROLE_LABEL[signerRole].toLowerCase()}, el libro auxiliar ` +
          `de donaciones de ${accountingPeriodLabel(period)}: renglones, conciliación contra Mercado Pago y ` +
          'el exporte para tu programa contable.\n\n' +
          `No necesitas cuenta. El enlace es personal y vence en ${ACCOUNTING_SHARE_DAYS} días:\n\n` +
          `${this.webBaseUrl}/contabilidad-compartida#token=${encodeURIComponent(token)}\n\n` +
          'AdoptaFácil prepara y concilia la información; no firma ni certifica por ti. Si la ' +
          'organización te pide firmar el cierre del mes, te llegará otro correo con un enlace de firma.\n\n' +
          'Si no esperabas este correo, ignóralo.',
      })
      .catch(() => undefined);
    return {
      id: share.id,
      period,
      signerRole,
      signerName,
      expiresAt: share.expiresAt.toISOString(),
      revokedAt: null,
      createdAt: share.createdAt.toISOString(),
    };
  }

  async revokeShare(id: string, actorUserId: string): Promise<void> {
    const organizationId = this.requireOrgId();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const share = await tx.accountingShare.findFirst({ where: { id, organizationId } });
      if (!share) throw new NotFoundException('Enlace no encontrado.');
      if (share.revokedAt) throw new ConflictException('Este enlace ya fue revocado.');
      await tx.accountingShare.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'accounting.share_revoked',
        entityType: 'accounting_share',
        entityId: id,
        metadata: { period: share.period },
      });
    });
  }

  /** Resuelve un enlace compartido, o 400 con un solo mensaje para cualquier fallo. */
  private async resolveShare(token: string) {
    const found = await this.prisma.$queryRaw<
      Array<{ share: { id: string; organizationId: string } | null }>
    >`SELECT accounting_share_by_token_hash(${hashToken(token)}) AS share`;
    const ref = found[0]?.share;
    if (!ref) throw new BadRequestException(INVALID_SHARE_LINK);
    const share = await this.prisma.withOrgContext(ref.organizationId, async (tx) => {
      const share = await tx.accountingShare.findFirst({
        where: { id: ref.id },
        include: { signerUser: { select: { displayName: true } } },
      });
      if (!share || share.revokedAt || share.expiresAt <= new Date()) return null;
      // Si la organización cambió o revocó a ese contador / revisor, su enlace muere.
      const designation = await tx.orgSignerDesignation.findFirst({
        where: {
          organizationId: ref.organizationId,
          userId: share.signerUserId,
          role: share.signerRole,
          revokedAt: null,
        },
        select: { id: true },
      });
      return designation ? share : null;
    });
    if (!share) throw new BadRequestException(INVALID_SHARE_LINK);
    if (!(await this.plans.hasCapability(share.organizationId, 'accountantPackage'))) {
      throw new BadRequestException(INVALID_SHARE_LINK);
    }
    return share;
  }

  async sharePreview(
    token: string,
    evidence: { ip?: string; userAgent?: string },
  ): Promise<AccountingSharePreview> {
    const share = await this.resolveShare(token);
    const organizationId = share.organizationId;
    await this.sync(organizationId);
    const rec = await this.computeReconciliation(organizationId, share.period);
    const input = await this.exportInput(organizationId, share.period, false);
    const report = await this.reports.accountingReportFor(organizationId, share.period);
    await this.audit.record({
      organizationId,
      actorUserId: null,
      action: 'accounting.share_viewed',
      entityType: 'accounting_share',
      entityId: share.id,
      metadata: {
        period: share.period,
        signerRole: share.signerRole,
        ip: evidence.ip,
        userAgent: evidence.userAgent?.slice(0, 200),
      },
    });
    return {
      organizationName: input.organizationName,
      nit: input.nit,
      period: share.period,
      status: input.status,
      closedAt: input.closedAt,
      signerRole: share.signerRole as AdditionalSignerRole,
      signerName: share.signerUser.displayName,
      expiresAt: share.expiresAt.toISOString(),
      totals: input.totals,
      reconciliation: {
        counts: rec.counts,
        balanced: rec.balanced,
        platformTotalCop: rec.platformTotalCop,
        gatewayTotalCop: rec.gatewayTotalCop,
        gatewayFeesCop: rec.gatewayFeesCop,
        gatewayNetCop: rec.gatewayNetCop,
      },
      entries: input.entries,
      report: report ? { code: report.code, status: report.status } : null,
    };
  }

  /** El exporte COMPLETO del mes para el contador / revisor (sin cuenta). */
  async shareExport(
    token: string,
    format: 'csv' | 'xlsx',
    evidence: { ip?: string; userAgent?: string },
  ): Promise<{ filename: string; data: Buffer; contentType: string }> {
    const share = await this.resolveShare(token);
    await this.sync(share.organizationId);
    const input = await this.exportInput(share.organizationId, share.period, true);
    await this.audit.record({
      organizationId: share.organizationId,
      actorUserId: null,
      action: 'accounting.share_downloaded',
      entityType: 'accounting_share',
      entityId: share.id,
      metadata: {
        period: share.period,
        format,
        ip: evidence.ip,
        userAgent: evidence.userAgent?.slice(0, 200),
      },
    });
    return this.file(input, format, true);
  }

  /**
   * Desde el enlace de FIRMA del libro auxiliar: el contador / revisor
   * descarga el exporte completo del mes que va a firmar, sin cuenta.
   */
  async signaturePackage(
    signatureToken: string,
    format: 'csv' | 'xlsx',
  ): Promise<{ filename: string; data: Buffer; contentType: string }> {
    const ref = await this.reports.accountingMonthForSignatureToken(signatureToken);
    const input = await this.exportInput(ref.organizationId, ref.month, true);
    await this.audit.record({
      organizationId: ref.organizationId,
      actorUserId: null,
      action: 'accounting.signature_package_downloaded',
      entityType: 'accounting_period',
      entityId: null,
      metadata: { period: ref.month, signerRole: ref.signerRole, format },
    });
    return this.file(input, format, true);
  }
}
