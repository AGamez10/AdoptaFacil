import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  type LedgerCategory,
  type LedgerEntry,
  LedgerEntryKind,
  LedgerSource,
  type LedgerTotals,
  type OrgLedgerPage,
  type PublicLedgerEntry,
  type PublicLedgerPage,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PlansService } from '../../core/plans/plans.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { sniffImageContentType } from '../../core/storage/image-optimizer';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { Env } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateLedgerEntryDto } from './ledger.schemas';

/** Minimal shape of a multer memory-storage file (no @types/multer installed). */
export interface UploadedSupportFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/** Soportes aceptados: foto de la factura/recibo o PDF. */
const SUPPORT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Tipo real según los primeros bytes (nunca el que declara el navegador). */
export function sniffSupportType(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  const image = sniffImageContentType(buffer);
  return image && SUPPORT_TYPES.includes(image) ? image : null;
}

/** Fila de la vista `ledger_movements` (snake_case, BIGINT llega como bigint). */
interface MovementRow {
  id: string;
  organization_id: string;
  source: string;
  kind: string;
  category: string;
  occurred_on: Date;
  amount_cop: bigint;
  concept: string;
  counterparty: string | null;
  has_support: boolean;
  support_filename: string | null;
  created_at: Date;
  voided_at: Date | null;
  void_reason: string | null;
}

/** Cuántos movimientos ve la organización de una vez en su pantalla. */
const ORG_PAGE = 300;
const PUBLIC_DEFAULT_PAGE = 20;
const PUBLIC_MAX_PAGE = 100;

function toEntry(row: MovementRow): LedgerEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    source: row.source as LedgerSource,
    kind: row.kind as LedgerEntryKind,
    category: row.category as LedgerCategory,
    occurredOn: row.occurred_on.toISOString().slice(0, 10),
    amountCop: Number(row.amount_cop),
    concept: row.concept,
    counterparty: row.counterparty ?? undefined,
    hasSupport: row.has_support,
    supportFilename: row.support_filename ?? undefined,
    createdAt: row.created_at.toISOString(),
    voidedAt: row.voided_at?.toISOString(),
    voidReason: row.void_reason ?? undefined,
  };
}

export function computeTotals(entries: readonly LedgerEntry[]): LedgerTotals {
  let incomeCop = 0;
  let expenseCop = 0;
  let entryCount = 0;
  let lastEntryOn: string | null = null;
  for (const e of entries) {
    if (e.voidedAt) continue;
    entryCount += 1;
    if (e.kind === LedgerEntryKind.Income) incomeCop += e.amountCop;
    else expenseCop += e.amountCop;
    if (!lastEntryOn || e.occurredOn > lastEntryOn) lastEntryOn = e.occurredOn;
  }
  return { incomeCop, expenseCop, balanceCop: incomeCop - expenseCop, entryCount, lastEntryOn };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * RF14 · Libro público de transparencia.
 *
 * - La organización (Owner/Administrator) registra ingresos y gastos a mano,
 *   con soporte opcional PRIVADO (factura/recibo). Registrar es idempotente por
 *   `clientRequestId`: un doble clic o un reintento devuelve el mismo movimiento.
 * - Un movimiento no se edita ni se borra: se ANULA con motivo (la base lo
 *   impone con GRANT por columna + trigger). La anulación se ve en el portal.
 * - Las donaciones aprobadas por la pasarela entran solas (vista
 *   `ledger_movements`), sin doble escritura.
 * - El público lo lee por `public_ledger_entries` (SECURITY DEFINER acotada).
 */
@Injectable()
export class LedgerService {
  private readonly maxMb: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    config: ConfigService<Env, true>,
  ) {
    this.maxMb = config.get('STORAGE_MAX_FILE_MB', { infer: true });
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  private async movementById(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<MovementRow | undefined> {
    const rows = await tx.$queryRaw<MovementRow[]>(
      Prisma.sql`SELECT * FROM ledger_movements WHERE id = ${id}::uuid`,
    );
    return rows[0];
  }

  /** Libro completo de la organización (sus movimientos + donaciones en línea). */
  async listForOrg(): Promise<OrgLedgerPage> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.$queryRaw<MovementRow[]>(Prisma.sql`
        SELECT * FROM ledger_movements
        WHERE organization_id = ${organizationId}::uuid
        ORDER BY occurred_on DESC, created_at DESC
        LIMIT ${ORG_PAGE}
      `),
    );
    const items = rows.map(toEntry);
    // Totales sobre TODO el libro (no solo la página que se muestra).
    const totals = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.$queryRaw<
        Array<{ income: bigint | null; expense: bigint | null; n: bigint; last: Date | null }>
      >(Prisma.sql`
        SELECT sum(amount_cop) FILTER (WHERE kind = 'income') AS income,
               sum(amount_cop) FILTER (WHERE kind = 'expense') AS expense,
               count(*) AS n,
               max(occurred_on) AS last
        FROM ledger_movements
        WHERE organization_id = ${organizationId}::uuid AND voided_at IS NULL
      `),
    );
    const t = totals[0];
    const incomeCop = Number(t?.income ?? 0);
    const expenseCop = Number(t?.expense ?? 0);
    return {
      items,
      totals: {
        incomeCop,
        expenseCop,
        balanceCop: incomeCop - expenseCop,
        entryCount: Number(t?.n ?? 0),
        lastEntryOn: t?.last ? t.last.toISOString().slice(0, 10) : null,
      },
    };
  }

  async create(
    actorUserId: string,
    input: CreateLedgerEntryDto,
    file: UploadedSupportFile | undefined,
  ): Promise<LedgerEntry> {
    const organizationId = this.requireOrgId();

    // Reintento idempotente: si ese intento ya quedó guardado, se devuelve tal cual
    // (antes de volver a subir el archivo).
    if (input.clientRequestId) {
      const existing = await this.findByClientRequestId(organizationId, input.clientRequestId);
      if (existing) return existing;
    }

    let support:
      { key: string; filename: string; contentType: string; sizeBytes: number } | undefined;
    if (file && file.buffer && file.size > 0) {
      if (file.size > this.maxMb * 1024 * 1024) {
        throw new PayloadTooLargeException(`El soporte supera el límite de ${this.maxMb} MB.`);
      }
      const contentType = sniffSupportType(file.buffer);
      if (!contentType) {
        throw new BadRequestException(
          'El soporte debe ser una foto (JPG, PNG o WebP) o un PDF de la factura o el recibo.',
        );
      }
      await this.plans.assertStorageAvailable(organizationId, file.size);
      const filename = (file.originalname || 'soporte').slice(0, 255);
      const stored = await this.storage.createUploadTarget({
        organizationId,
        filename,
        contentType,
        visibility: 'private',
      });
      await this.storage.saveObject(stored.key, file.buffer, contentType);
      support = { key: stored.key, filename, contentType, sizeBytes: file.size };
    }

    try {
      return await this.prisma.withOrgContext(organizationId, async (tx) => {
        const row = await tx.ledgerEntry.create({
          data: {
            organizationId,
            kind: input.kind,
            category: input.category,
            occurredOn: new Date(`${input.occurredOn}T00:00:00Z`),
            amountCop: BigInt(input.amountCop),
            concept: input.concept,
            counterparty: input.kind === 'expense' ? (input.counterparty ?? null) : null,
            supportStorageRef: support?.key ?? null,
            supportFilename: support?.filename ?? null,
            supportContentType: support?.contentType ?? null,
            supportSizeBytes: support?.sizeBytes ?? null,
            clientRequestId: input.clientRequestId ?? null,
            createdByUserId: actorUserId,
          },
          select: { id: true },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'ledger.entry_created',
          entityType: 'ledger_entry',
          entityId: row.id,
          metadata: {
            kind: input.kind,
            category: input.category,
            amountCop: input.amountCop,
            occurredOn: input.occurredOn,
            hasSupport: Boolean(support),
          },
        });
        const created = await this.movementById(tx, row.id);
        if (!created) throw new NotFoundException('Movimiento no encontrado.');
        return toEntry(created);
      });
    } catch (error) {
      // Dos reintentos simultáneos con la misma clave: gana uno y el otro lo lee.
      if (input.clientRequestId && isUniqueViolation(error)) {
        const existing = await this.findByClientRequestId(organizationId, input.clientRequestId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async findByClientRequestId(
    organizationId: string,
    clientRequestId: string,
  ): Promise<LedgerEntry | null> {
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const found = await tx.ledgerEntry.findFirst({
        where: { organizationId, clientRequestId },
        select: { id: true },
      });
      if (!found) return null;
      const row = await this.movementById(tx, found.id);
      return row ? toEntry(row) : null;
    });
  }

  /** Anula un movimiento MANUAL vigente. Nunca borra: queda visible como anulado. */
  async void(actorUserId: string, id: string, reason: string): Promise<LedgerEntry> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.ledgerEntry.findUnique({
        where: { id },
        select: { id: true, voidedAt: true },
      });
      if (!existing) {
        const online = await this.movementById(tx, id);
        if (online) {
          throw new BadRequestException(
            'Las donaciones en línea no se anulan aquí: las registra la pasarela de pagos.',
          );
        }
        throw new NotFoundException('Movimiento no encontrado.');
      }
      if (existing.voidedAt) {
        throw new ConflictException('Este movimiento ya estaba anulado.');
      }
      // Atómico frente a una anulación concurrente.
      const result = await tx.ledgerEntry.updateMany({
        where: { id, voidedAt: null },
        data: { voidedAt: new Date(), voidedByUserId: actorUserId, voidReason: reason },
      });
      if (result.count === 0) {
        throw new ConflictException('Este movimiento ya estaba anulado.');
      }
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'ledger.entry_voided',
        entityType: 'ledger_entry',
        entityId: id,
        metadata: { reason },
      });
      const row = await this.movementById(tx, id);
      if (!row) throw new NotFoundException('Movimiento no encontrado.');
      return toEntry(row);
    });
  }

  /** Soporte privado de un movimiento (solo el equipo de la organización); auditado. */
  async downloadSupport(
    actorUserId: string,
    id: string,
  ): Promise<{ data: Buffer; contentType: string; filename: string }> {
    const organizationId = this.requireOrgId();
    const entry = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.ledgerEntry.findUnique({
        where: { id },
        select: { supportStorageRef: true, supportContentType: true, supportFilename: true },
      });
      if (!row?.supportStorageRef) {
        throw new NotFoundException('Este movimiento no tiene soporte.');
      }
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'ledger.support_downloaded',
        entityType: 'ledger_entry',
        entityId: id,
        metadata: {},
      });
      return row;
    });
    const object = await this.storage.readObject(entry.supportStorageRef as string);
    if (!object) {
      throw new NotFoundException('No encontramos el archivo del soporte.');
    }
    return {
      data: object.data,
      contentType: entry.supportContentType ?? object.contentType ?? 'application/octet-stream',
      filename: entry.supportFilename ?? 'soporte',
    };
  }

  /** Libro público por slug (sin sesión). `null` si la organización no tiene portal público. */
  async publicBySlug(
    slug: string,
    limit?: number,
    offset?: number,
  ): Promise<PublicLedgerPage | null> {
    const orgRows = await this.prisma.$queryRaw<Array<{ data: { id: string } | null }>>(
      Prisma.sql`SELECT organization_public(${slug}) AS data`,
    );
    const organizationId = orgRows[0]?.data?.id;
    if (!organizationId) return null;

    const take =
      !limit || Number.isNaN(limit)
        ? PUBLIC_DEFAULT_PAGE
        : Math.min(Math.max(Math.trunc(limit), 1), PUBLIC_MAX_PAGE);
    const skip = !offset || Number.isNaN(offset) ? 0 : Math.max(Math.trunc(offset), 0);

    const rows = await this.prisma.$queryRaw<
      Array<{
        data: {
          items: Array<
            Omit<PublicLedgerEntry, 'counterparty' | 'voidReason'> & {
              counterparty: string | null;
              voidReason: string | null;
            }
          >;
          total: number;
          totals: {
            incomeCop: number;
            expenseCop: number;
            entryCount: number;
            lastEntryOn: string | null;
          };
        };
      }>
    >(
      Prisma.sql`SELECT public_ledger_entries(${organizationId}::uuid, ${take}::int, ${skip}::int) AS data`,
    );
    const data = rows[0]?.data;
    const incomeCop = Number(data?.totals?.incomeCop ?? 0);
    const expenseCop = Number(data?.totals?.expenseCop ?? 0);
    return {
      items: (data?.items ?? []).map((item) => ({
        id: item.id,
        source: item.source,
        kind: item.kind,
        category: item.category,
        occurredOn: item.occurredOn,
        amountCop: Number(item.amountCop),
        concept: item.concept,
        counterparty: item.counterparty ?? undefined,
        hasSupport: Boolean(item.hasSupport),
        createdAt: item.createdAt,
        voided: Boolean(item.voided),
        voidReason: item.voidReason ?? undefined,
      })),
      total: Number(data?.total ?? 0),
      limit: take,
      offset: skip,
      totals: {
        incomeCop,
        expenseCop,
        balanceCop: incomeCop - expenseCop,
        entryCount: Number(data?.totals?.entryCount ?? 0),
        lastEntryOn: data?.totals?.lastEntryOn ?? null,
      },
    };
  }
}
