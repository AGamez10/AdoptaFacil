import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type {
  AdoptionAnimalSnapshot,
  AdoptionApplicant,
  AdoptionRequest,
  AdoptionStatus,
  CreateAdoptionRequestInput,
  TransitionAdoptionRequestInput,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AuditService } from '../../core/audit/audit.service';
import { InboxService } from '../../core/notifications/inbox/inbox.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import type { RequestUser } from '../../core/auth/auth.types';
import { requireCompleteProfile } from '../../core/auth/require-complete-profile';
import type { Env } from '../../config/env.validation';
import { checkAdoptionTransition } from './adoption-status';
import {
  buildAdoptionStatusEmailBody,
  buildAdoptionStatusEmailSubject,
  buildAdoptionRequestsLink,
} from './adoption-request-email';
import { ADOPTION_STATUS_EMAIL_LABELS } from './adoption-status-labels';

/** Shape returned by the `create_adoption_request` SQL function (snake_case). */
interface AdoptionRow {
  id: string;
  organization_id: string;
  animal_id: string;
  animal_snapshot: AdoptionAnimalSnapshot;
  applicant_user_id: string;
  applicant: AdoptionApplicant;
  message: string;
  status: string;
  contract_ref: string | null;
  tracking_ref: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Prisma model row (camelCase) for `adoption_requests`. */
type AdoptionModel = Prisma.AdoptionRequestGetPayload<Record<string, never>>;

@Injectable()
export class AdoptionsService {
  private readonly logger = new Logger('Adoptions');
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    config: ConfigService<Env, true>,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly inbox: InboxService,
  ) {
    this.webBaseUrl = config.get('WEB_BASE_URL', { infer: true });
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Create an adoption request as an authenticated PERSON (§M04, RF10). The
   * request lands in the OWNING org's tenant via the `create_adoption_request`
   * SECURITY DEFINER function (controlled cross-tenant write; the applicant is
   * not a member of that org). Enforces:
   *   - conflict of interest (§12): cannot apply to your own org's animal;
   *   - uniqueness (RF10): one ACTIVE request per (animal, user) — partial index;
   *   - message length (RF10) — validated by the zod schema upstream.
   */
  async create(actor: RequestUser, input: CreateAdoptionRequestInput): Promise<AdoptionRequest> {
    await requireCompleteProfile(this.prisma, actor);

    if (actor.organizationId === input.organizationId) {
      throw new ForbiddenException(
        'No puedes postular a un animal de tu propia organización (conflicto de interés).',
      );
    }

    // P0-3 (AF-024): el animal se lee de la base — debe existir, ser de esa
    // organización, estar activo y disponible — y el snapshot (nombre,
    // especie, foto) se construye AQUÍ, nunca con lo que mande el cliente. La
    // función SQL vuelve a verificarlo todo de forma atómica.
    const animalSnapshot = await this.serverAnimalSnapshot(input.organizationId, input.animalId);

    let row: AdoptionRow;
    try {
      const rows = await this.prisma.$queryRaw<AdoptionRow[]>(Prisma.sql`
        SELECT * FROM create_adoption_request(
          ${input.organizationId}::uuid,
          ${input.animalId}::uuid,
          ${JSON.stringify(animalSnapshot)}::jsonb,
          ${actor.id}::uuid,
          ${JSON.stringify(input.applicant)}::jsonb,
          ${input.message}
        )
      `);
      row = rows[0];
    } catch (error) {
      if (this.isActiveDuplicate(error)) {
        throw new ConflictException('Ya tienes una solicitud activa para este animal.');
      }
      this.rethrowAnimalError(error);
      throw error;
    }

    // Auditoría append-only: se registra en el tenant de la org destino
    // (AuditService.record fija su contexto). NUNCA datos personales en claro.
    await this.audit.record({
      organizationId: input.organizationId,
      actorUserId: actor.id,
      action: 'adoption.request.created',
      entityType: 'adoption_request',
      entityId: row.id,
      metadata: { animalId: input.animalId },
    });

    const animalName = animalSnapshot.name;
    await this.inbox.toOrgStaff(input.organizationId, {
      kind: 'adoptions.request_received',
      title: `Nueva solicitud de adopción para ${animalName}`,
      body: 'Revísala en el tablero de adopciones y avanza a "evaluar" cuando la estudies.',
      href: `/adopciones?foco=${row.id}`,
      dedupeKey: `adoption_request:${row.id}`,
    });
    await this.inbox.toUser(actor.id, {
      kind: 'adoptions.request_sent',
      tone: 'kudos',
      title: `¡Gracias por querer adoptar a ${animalName}!`,
      body: 'La organización ya recibió tu solicitud. Te avisaremos aquí y por correo cada vez que avance.',
      href: '/mis-solicitudes',
      dedupeKey: `adoption_request_sent:${row.id}`,
    });

    return this.fromRow(row);
  }

  /** Snapshot del animal construido en el servidor (P0-3). 404 si no existe,
   *  es de otra organización, está inactivo o la organización no está
   *  aprobada; 409 si ya no está disponible para adopción. */
  private async serverAnimalSnapshot(
    organizationId: string,
    animalId: string,
  ): Promise<AdoptionAnimalSnapshot> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { status: true },
    });
    if (organization?.status !== 'approved') {
      throw new NotFoundException('Animal no encontrado.');
    }
    const animal = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.animal.findFirst({
        where: { id: animalId, organizationId, isActive: true },
        select: {
          id: true,
          name: true,
          species: true,
          status: true,
          photos: { orderBy: { order: 'asc' }, take: 1, select: { storageRef: true } },
        },
      }),
    );
    if (!animal) {
      throw new NotFoundException('Animal no encontrado.');
    }
    if (animal.status !== 'available') {
      throw new ConflictException('Este animal ya no está disponible para adopción.');
    }
    const photoRef = animal.photos[0]?.storageRef;
    return {
      animalId: animal.id,
      name: animal.name,
      species: animal.species as AdoptionAnimalSnapshot['species'],
      photoUrl: photoRef ? this.storage.resolvePublicUrl(photoRef) : undefined,
    };
  }

  /** Traduce los errores de `create_adoption_request` (carrera entre la
   *  lectura y la inserción) a 404/409. */
  private rethrowAnimalError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('adoption_animal_not_found')) {
      throw new NotFoundException('Animal no encontrado.');
    }
    if (message.includes('adoption_animal_unavailable')) {
      throw new ConflictException('Este animal ya no está disponible para adopción.');
    }
  }

  /** The org's own adoption requests for the evaluation kanban (RLS-scoped). */
  async listForOrg(): Promise<AdoptionRequest[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.adoptionRequest.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } }),
    );
    return rows.map((r) => this.fromModel(r));
  }

  /**
   * The applicant's OWN adoption requests (F1-01), across every organization they
   * applied to — cross-tenant via `adoption_requests_for_applicant` SECURITY
   * DEFINER (by identity, not by tenant), same pattern as `donations_for_donor`
   * (T-050/S1-02). Enriched with each request's org name (batch, anti-N+1) so
   * "Mis solicitudes" doesn't show a raw id, mirroring `Donation.organizationName`.
   */
  async listMine(actor: RequestUser): Promise<AdoptionRequest[]> {
    const rows = await this.prisma.$queryRaw<AdoptionRow[]>(Prisma.sql`
      SELECT * FROM adoption_requests_for_applicant(${actor.id}::uuid)
    `);
    const orgNames = await this.organizationNamesById(rows.map((r) => r.organization_id));
    return rows.map((r) => this.fromRow(r, orgNames.get(r.organization_id)));
  }

  private async organizationNamesById(ids: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true },
    });
    return new Map(orgs.map((org) => [org.id, org.name]));
  }

  /** Move a request through the evaluation state machine, AUDITED (UTC). */
  async transition(
    actor: RequestUser,
    id: string,
    input: TransitionAdoptionRequestInput,
  ): Promise<AdoptionRequest> {
    const organizationId = this.requireOrgId();
    const updated = await this.prisma.withOrgContext(organizationId, async (tx) => {
      // RLS scopes the read to this org; a foreign id simply returns null.
      const current = await tx.adoptionRequest.findUnique({ where: { id } });
      if (!current || current.organizationId !== organizationId) {
        throw new NotFoundException('Solicitud de adopción no encontrada.');
      }
      const check = checkAdoptionTransition(current.status as AdoptionStatus, input.targetStatus);
      if (!check.allowed) {
        throw new ConflictException(check.error);
      }
      if (input.targetStatus === 'approved') {
        // P0-3: un animal se aprueba para UNA sola persona. Se bloquea su fila
        // (dos aprobaciones simultáneas se serializan), se exige que siga
        // disponible y pasa a `in_process`; el índice único parcial
        // `adoption_requests_one_approved_per_animal` es la última garantía.
        const locked = await tx.$queryRaw<Array<{ status: string }>>(
          Prisma.sql`SELECT status FROM "animals"
                     WHERE id = ${current.animalId}::uuid
                       AND organization_id = ${organizationId}::uuid
                       AND is_active = true
                     FOR UPDATE`,
        );
        if (locked.length === 0) {
          throw new ConflictException(
            'No se puede aprobar: el animal de esta solicitud ya no existe en tu organización.',
          );
        }
        const alreadyApproved = await tx.adoptionRequest.findFirst({
          where: { organizationId, animalId: current.animalId, status: 'approved' },
          select: { id: true },
        });
        if (alreadyApproved || locked[0].status !== 'available') {
          throw new ConflictException(
            'Este animal ya tiene una adopción aprobada o en curso: no se puede aprobar otra solicitud.',
          );
        }
        await tx.animal.update({
          where: { id: current.animalId },
          data: { status: 'in_process' },
        });
      }
      const next = await tx.adoptionRequest.update({
        where: { id },
        data: { status: input.targetStatus },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.request.transitioned',
        entityType: 'adoption_request',
        entityId: id,
        metadata: {
          from: current.status,
          to: input.targetStatus,
          reason: input.reason?.trim() || null,
        },
      });
      return next;
    });

    // Nombre real de la org para el correo (F-CORREO-ADOPCION) — mismo helper
    // batch anti-N+1 que ya usa `fromRow`/`listMine`, un solo id aquí.
    const organizationName = (await this.organizationNamesById([organizationId])).get(
      organizationId,
    );
    await this.notifyApplicant(updated, organizationName);
    const snapshot = updated.animalSnapshot as unknown as AdoptionAnimalSnapshot;
    const status = updated.status as AdoptionStatus;
    const label = ADOPTION_STATUS_EMAIL_LABELS[status] ?? status;
    await this.inbox.toUser(updated.applicantUserId, {
      kind: 'adoptions.status_changed',
      tone: status === 'approved' ? 'success' : status === 'rejected' ? 'warning' : 'info',
      title: `Tu solicitud para adoptar a ${snapshot.name} avanzó: ${label}`,
      body: `${organizationName ?? 'La organización'} actualizó tu solicitud.`,
      href: '/mis-solicitudes',
      dedupeKey: `adoption_status:${id}:${status}`,
    });
    return this.fromModel(updated);
  }

  /** Best-effort applicant notification behind the simulable NotificationPort. */
  private async notifyApplicant(row: AdoptionModel, organizationName?: string): Promise<void> {
    const applicant = row.applicant as unknown as AdoptionApplicant;
    const snapshot = row.animalSnapshot as unknown as AdoptionAnimalSnapshot;
    const emailInput = {
      applicantName: applicant.fullName,
      animalName: snapshot.name,
      organizationName,
      status: row.status as AdoptionStatus,
      webBaseUrl: this.webBaseUrl,
    };
    try {
      await this.notifications.send({
        to: applicant.email,
        subject: buildAdoptionStatusEmailSubject(emailInput),
        body: buildAdoptionStatusEmailBody(emailInput),
        template: {
          event: 'adoption.status_changed',
          organizationName,
          organizationId: row.organizationId,
          data: {
            nombre: emailInput.applicantName,
            animal: emailInput.animalName,
            organizacion: organizationName,
            estado: ADOPTION_STATUS_EMAIL_LABELS[emailInput.status],
            enlace: buildAdoptionRequestsLink(this.webBaseUrl),
          },
        },
      });
    } catch (error) {
      this.logger.warn(`No se pudo notificar al solicitante: ${(error as Error).message}`);
    }
  }

  /** A raw-query error caused by the active-request partial unique index. */
  private isActiveDuplicate(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const meta = JSON.stringify(error.meta ?? {});
      return (
        error.code === 'P2002' ||
        meta.includes('adoption_requests_active_uq') ||
        meta.includes('23505')
      );
    }
    return false;
  }

  private fromRow(row: AdoptionRow, organizationName?: string): AdoptionRequest {
    return {
      id: row.id,
      organizationId: row.organization_id,
      organizationName,
      animalId: row.animal_id,
      animalSnapshot: row.animal_snapshot,
      applicantUserId: row.applicant_user_id,
      applicant: row.applicant,
      message: row.message,
      status: row.status as AdoptionStatus,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      contractRef: row.contract_ref ?? undefined,
      trackingRef: row.tracking_ref ?? undefined,
    };
  }

  private fromModel(row: AdoptionModel): AdoptionRequest {
    return {
      id: row.id,
      organizationId: row.organizationId,
      animalId: row.animalId,
      animalSnapshot: row.animalSnapshot as unknown as AdoptionAnimalSnapshot,
      applicantUserId: row.applicantUserId,
      applicant: row.applicant as unknown as AdoptionApplicant,
      message: row.message,
      status: row.status as AdoptionStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      contractRef: row.contractRef ?? undefined,
      trackingRef: row.trackingRef ?? undefined,
    };
  }
}
