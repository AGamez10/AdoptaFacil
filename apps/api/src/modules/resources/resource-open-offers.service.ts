import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ResourceOpenOffer as OpenOfferRow } from '@prisma/client';
import {
  type ClaimResourceOpenOfferInput,
  type ClaimResourceOpenOfferResult,
  type CreateResourceOpenOfferInput,
  MAX_OPEN_OFFERS_PER_DONOR,
  OPEN_OFFER_TTL_DAYS,
  type ResourceCategory,
  type ResourceOpenOffer,
  type ResourceOpenOfferBoardItem,
  type ResourceOpenOffersBoardPage,
  type ResourceOpenOffersPublicPage,
  ResourceOpenOfferStatus,
  Role,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { AuditService } from '../../core/audit/audit.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { InboxService } from '../../core/notifications/inbox/inbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import { clampLimit } from './resource-needs.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Raw board item emitted by `resource_open_offers_board`. */
interface RawBoardItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  quantity: number;
  unit: string;
  department: string;
  city: string;
  createdAt: string;
  expiresAt: string;
  fromYourOrganization?: boolean;
}

interface ClaimSqlRow {
  offer_id: string;
  need_id: string;
  need_created: boolean;
  donor_user_id: string;
  donor_org_id: string;
  title: string;
  quantity: number;
  unit: string;
}

function toBoardItem(raw: RawBoardItem): ResourceOpenOfferBoardItem {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? undefined,
    category: raw.category as ResourceCategory,
    quantity: raw.quantity,
    unit: raw.unit,
    department: raw.department,
    city: raw.city,
    createdAt: raw.createdAt,
    expiresAt: raw.expiresAt,
    ...(raw.fromYourOrganization ? { fromYourOrganization: true } : {}),
  };
}

/**
 * M09 — ofrecimientos ABIERTOS: alguien tiene algo para donar y no hay (o no
 * encontró) una necesidad publicada. La fila vive en el tenant de quien ofrece
 * (RLS normal para crear, listar y retirar). Las organizaciones lo ven en un
 * tablero acotado sin identidad del donante y lo toman para una necesidad
 * propia: `claim_resource_open_offer` (SECURITY DEFINER) crea la oferta YA
 * aceptada y su entrega, así que desde ahí sigue el flujo normal del banco.
 */
@Injectable()
export class ResourceOpenOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly inbox: InboxService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  private async toOwn(row: OpenOfferRow): Promise<ResourceOpenOffer> {
    let claimedByOrganizationName: string | undefined;
    if (row.claimedByOrganizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: row.claimedByOrganizationId },
        select: { name: true },
      });
      claimedByOrganizationName = org?.name;
    }
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      category: row.category as ResourceCategory,
      quantity: row.quantity,
      unit: row.unit,
      department: row.department,
      city: row.city,
      status: row.status as ResourceOpenOfferStatus,
      expired: row.status === ResourceOpenOfferStatus.Open && row.expiresAt.getTime() <= Date.now(),
      claimedByOrganizationName,
      claimedAt: row.claimedAt?.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Dejar un ofrecimiento abierto (cualquier autenticado, en su propio tenant). */
  async create(
    actor: RequestUser,
    input: CreateResourceOpenOfferInput,
  ): Promise<ResourceOpenOffer> {
    const row = await this.prisma.withOrgContext(actor.organizationId, async (tx) => {
      const openCount = await tx.resourceOpenOffer.count({
        where: {
          donorUserId: actor.id,
          status: ResourceOpenOfferStatus.Open,
          expiresAt: { gt: new Date() },
        },
      });
      if (openCount >= MAX_OPEN_OFFERS_PER_DONOR) {
        throw new ConflictException(
          `Ya tienes ${MAX_OPEN_OFFERS_PER_DONOR} ofrecimientos abiertos. Retira alguno antes de dejar otro.`,
        );
      }
      const created = await tx.resourceOpenOffer.create({
        data: {
          organizationId: actor.organizationId,
          donorUserId: actor.id,
          title: input.title,
          description: input.description ?? null,
          category: input.category,
          quantity: input.quantity,
          unit: input.unit,
          department: input.department,
          city: input.city,
          expiresAt: new Date(Date.now() + OPEN_OFFER_TTL_DAYS * DAY_MS),
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        action: 'resource_open_offer.created',
        entityType: 'resource_open_offer',
        entityId: created.id,
        metadata: { category: input.category, quantity: input.quantity, city: input.city },
      });
      return created;
    });
    await this.announce(actor, row);
    return this.toOwn(row);
  }

  /**
   * Un ofrecimiento nuevo le interesa a todo el banco: avisa (solo en la
   * plataforma, sin correo masivo) a los equipos de las organizaciones
   * aprobadas del mismo departamento y, si quien ofrece es parte de un equipo,
   * a sus compañeros. A quien ofrece le confirma que quedó publicado.
   */
  private async announce(actor: RequestUser, row: OpenOfferRow): Promise<void> {
    const what = `${row.quantity} ${row.unit} · ${row.title}`;
    await this.inbox.toOrgsInDepartment(row.department, row.organizationId, {
      kind: 'resources.open_offer_published',
      title: `Nuevo ofrecimiento en ${row.city}: ${row.title}`,
      body: `Alguien ofrece ${what}. Si le sirve a tu organización, puedes tomarlo desde el tablero.`,
      href: `/organizacion/recursos/ofrecimientos?foco=${row.id}`,
      dedupeKey: `open_offer:${row.id}`,
    });
    if (actor.accountType === 'organization') {
      await this.inbox.toOrgStaff(
        row.organizationId,
        {
          kind: 'resources.open_offer_published',
          title: `Alguien de tu equipo ofreció: ${row.title}`,
          body: `${what} en ${row.city}. Lo verán las demás organizaciones en el tablero de ofrecimientos.`,
          href: `/organizacion/recursos/ofrecimientos?foco=${row.id}`,
          dedupeKey: `open_offer:${row.id}`,
        },
        { roles: [Role.Owner, Role.Administrator, Role.Operator], excludeUserId: actor.id },
      );
    }
    await this.inbox.toUser(actor.id, {
      kind: 'resources.open_offer_published',
      tone: 'kudos',
      title: '¡Gracias por compartir! Tu ofrecimiento ya está publicado',
      body: `"${row.title}" lo ven las organizaciones y aparece en el banco de recursos durante ${OPEN_OFFER_TTL_DAYS} días.`,
      href: `/mis-ofertas?foco=${row.id}`,
      dedupeKey: `open_offer_mine:${row.id}`,
    });
  }

  /** Lista PÚBLICA y anónima de ofrecimientos abiertos (sin sesión). */
  async publicList(limit: number, offset: number): Promise<ResourceOpenOffersPublicPage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawBoardItem[]; total: number } }>
    >(Prisma.sql`SELECT public_resource_open_offers(${take}::int, ${skip}::int) AS data`);
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map((raw) => {
        const { fromYourOrganization: _omit, ...item } = toBoardItem(raw);
        return item;
      }),
      total: Number(data.total ?? 0),
      limit: take,
      offset: skip,
    };
  }

  /** Los ofrecimientos propios, más recientes primero. */
  async listMine(actor: RequestUser): Promise<ResourceOpenOffer[]> {
    const rows = await this.prisma.withOrgContext(actor.organizationId, (tx) =>
      tx.resourceOpenOffer.findMany({
        where: { donorUserId: actor.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
    return Promise.all(rows.map((row) => this.toOwn(row)));
  }

  /** Retirar el propio ofrecimiento mientras siga abierto. */
  async withdraw(actor: RequestUser, id: string): Promise<ResourceOpenOffer> {
    const row = await this.prisma.withOrgContext(actor.organizationId, async (tx) => {
      const existing = await tx.resourceOpenOffer.findFirst({
        where: { id, donorUserId: actor.id },
      });
      if (!existing) throw new NotFoundException('Ofrecimiento no encontrado.');
      if (existing.status !== ResourceOpenOfferStatus.Open) {
        throw new BadRequestException('Este ofrecimiento ya no está abierto.');
      }
      const updated = await tx.resourceOpenOffer.update({
        where: { id },
        data: { status: ResourceOpenOfferStatus.Withdrawn },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        action: 'resource_open_offer.withdrawn',
        entityType: 'resource_open_offer',
        entityId: id,
      });
      return updated;
    });
    return this.toOwn(row);
  }

  /** Tablero de la organización: ofrecimientos abiertos de otras cuentas. */
  async board(
    limit: number,
    offset: number,
    category?: string,
    city?: string,
  ): Promise<ResourceOpenOffersBoardPage> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawBoardItem[]; total: number } }>
    >(
      Prisma.sql`SELECT resource_open_offers_board(${take}::int, ${skip}::int, ${category ?? null}::text, ${city?.trim() || null}::text, ${organizationId}::uuid) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map(toBoardItem),
      total: Number(data.total ?? 0),
      limit: take,
      offset: skip,
    };
  }

  /**
   * La organización toma un ofrecimiento para una necesidad propia (existente,
   * de la misma categoría y unidad) o, sin `needId`, publica en el mismo paso
   * una necesidad nueva con lo ofrecido. Todo ocurre en una sola función
   * transaccional; luego avisa al donante en la plataforma y por correo (best-effort).
   */
  async claim(
    actor: RequestUser,
    openOfferId: string,
    input: ClaimResourceOpenOfferInput,
  ): Promise<ClaimResourceOpenOfferResult> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.$queryRaw<ClaimSqlRow[]>(
      Prisma.sql`SELECT * FROM claim_resource_open_offer(${openOfferId}::uuid, ${organizationId}::uuid, ${input.needId ?? null}::uuid, ${input.needTitle ?? null}::text)`,
    );
    const claimed = rows[0];
    if (!claimed) {
      throw new BadRequestException(
        'No se pudo tomar: el ofrecimiento ya no está disponible o la necesidad no es de la misma categoría y unidad.',
      );
    }

    if (claimed.need_created) {
      await this.audit.record({
        organizationId,
        actorUserId: actor.id,
        action: 'resource_need.created',
        entityType: 'resource_need',
        entityId: claimed.need_id,
        metadata: { fromOpenOffer: openOfferId, quantityNeeded: claimed.quantity },
      });
    }
    await this.audit.record({
      organizationId,
      actorUserId: actor.id,
      action: 'resource_open_offer.claimed',
      entityType: 'resource_offer',
      entityId: claimed.offer_id,
      metadata: { openOfferId, needId: claimed.need_id },
    });
    await this.notifyDonor(organizationId, claimed);
    return { needId: claimed.need_id, offerId: claimed.offer_id };
  }

  /** Aviso (bandeja + correo) a quien dejó el ofrecimiento. Best-effort. */
  private async notifyDonor(organizationId: string, claimed: ClaimSqlRow): Promise<void> {
    const org = await this.prisma.organization
      .findUnique({ where: { id: organizationId }, select: { name: true } })
      .catch(() => null);
    const orgName = org?.name ?? 'Una organización';
    const offered = `${claimed.quantity} ${claimed.unit} · ${claimed.title}`;
    await this.inbox.toUser(
      claimed.donor_user_id,
      {
        kind: 'resources.open_offer_claimed',
        tone: 'success',
        title: `${orgName} quiere recibir lo que ofreciste`,
        body: `Tomó tu ofrecimiento "${offered}". Coordinarán contigo la entrega.`,
        href: `/mis-ofertas?foco=${claimed.offer_id}`,
        dedupeKey: `open_offer_claimed:${claimed.offer_id}`,
      },
      (donor) => ({
        subject: `${orgName} quiere recibir lo que ofreciste`,
        body: `${orgName} tomó tu ofrecimiento "${offered}". Míralo en "Mis ofertas".`,
        idempotencyKey: `resources.open_offer_claimed:${claimed.offer_id}`,
        template: {
          event: 'resources.open_offer_claimed',
          organizationName: org?.name ?? undefined,
          organizationId,
          data: {
            nombre: donor.displayName,
            ofrecimiento: offered,
            organizacion: orgName,
          },
        },
      }),
    );
  }
}
