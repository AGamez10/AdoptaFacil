import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { VolunteerOpportunity as OpportunityRow } from '@prisma/client';
import {
  type CancelVolunteerOpportunityInput,
  type CreateVolunteerOpportunityInput,
  dateOrderError,
  formatDayEs,
  type VolunteerOpportunityChangeResult,
  VolunteerEnrollmentStatus,
  type Paginated,
  type UpdateVolunteerOpportunityInput,
  type VolunteerOpportunity,
  VolunteerOpportunityStatus,
  type VolunteerOpportunityPublic,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AuditService } from '../../core/audit/audit.service';
import { InboxService } from '../../core/notifications/inbox/inbox.service';
import type { RequestUser } from '../../core/auth/auth.types';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import {
  buildOpportunityCancelledBody,
  buildOpportunityCancelledSubject,
  buildOpportunityRescheduledBody,
  buildOpportunityRescheduledSubject,
} from './volunteer-notifications';

const DEFAULT_PAGE = 20;
const MAX_PAGE = 100;

/** Clamp a requested page size to [1, MAX_PAGE]. */
export function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE);
}

/** `Date` de una columna `DATE` (medianoche UTC) → `AAAA-MM-DD`. */
export function toDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Normaliza los días de jornada (únicos, ordenados) y exige que todos caigan
 * dentro de las fechas de la convocatoria. Lanza 400 con el primer día fuera.
 */
export function normalizeSessionDates(
  days: readonly string[],
  startDate: string,
  endDate: string,
): string[] {
  // Mismo día que ve la base de datos (`start_date::date` sobre UTC).
  const start = new Date(startDate).toISOString().slice(0, 10);
  const end = new Date(endDate).toISOString().slice(0, 10);
  const unique = [...new Set(days)].sort();
  const outside = unique.find((day) => day < start || day > end);
  if (outside) {
    throw new BadRequestException(
      `El día de jornada ${outside} está fuera de las fechas de la convocatoria (${start} a ${end}).`,
    );
  }
  return unique;
}

const asDates = (days: readonly string[]): Date[] => days.map((d) => new Date(`${d}T00:00:00Z`));

function toOpportunity(row: OpportunityRow): VolunteerOpportunity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    capacity: row.capacity ?? undefined,
    location: row.location,
    requirements: row.requirements ?? undefined,
    appliesToStudentService: row.appliesToStudentService,
    status: row.status as VolunteerOpportunityStatus,
    sessionDates: row.sessionDates.map(toDay),
    cancelledAt: row.cancelledAt?.toISOString(),
    cancellationReason: row.cancellationReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Inscripciones que siguen "vivas" en una jornada: a ellas se les avisa de un
 *  cambio y son las que una cancelación cierra. */
const OPEN_ENROLLMENT_STATUSES: string[] = [
  VolunteerEnrollmentStatus.Pending,
  VolunteerEnrollmentStatus.Accepted,
];

/** "del 22 de noviembre de 2026 al 23 de noviembre de 2026" (o un solo día). */
export function describeOpportunityDates(startDate: Date, endDate: Date): string {
  const start = toDay(startDate);
  const end = toDay(endDate);
  return start === end
    ? `el ${formatDayEs(start)}`
    : `del ${formatDayEs(start)} al ${formatDayEs(end)}`;
}

/** Días de jornada legibles para el aviso de reprogramación. */
export function describeSessionDays(days: readonly string[]): string {
  if (days.length === 0) return 'todos los días de la convocatoria';
  return days.map((day) => formatDayEs(day)).join(', ');
}

/**
 * Horas ya registradas que una reprogramación dejaría por fuera (otra fecha o
 * un día que deja de ser jornada). Devuelve el primer día afectado, o null.
 */
export function hoursLeftOutside(
  loggedDays: readonly string[],
  startDay: string,
  endDay: string,
  sessionDays: readonly string[],
): string | null {
  for (const day of [...loggedDays].sort()) {
    if (day < startDay || day > endDay) return day;
    if (sessionDays.length > 0 && !sessionDays.includes(day)) return day;
  }
  return null;
}

/** Raw row from `organization_public(slug)` (T-101) — only `id`/`name` used here. */
interface RawPublicOrg {
  id: string;
  name: string;
}

/**
 * Volunteer opportunities (RF18 · M08). Owner/Administrator publish/edit;
 * view internally = write roles + ReadOnlyAuditor. The PUBLIC listing (no
 * session) resolves an org's slug via the EXISTING `organization_public`
 * SECURITY DEFINER function (T-101), then reads through `withOrgContext` —
 * same technique `PublicCampaignsService.listByOrgSlug` already uses (S2-07).
 */
@Injectable()
export class VolunteerOpportunitiesService {
  private readonly logger = new Logger('VolunteerOpportunities');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    private readonly inbox: InboxService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  async create(input: CreateVolunteerOpportunityInput): Promise<VolunteerOpportunity> {
    const organizationId = this.requireOrgId();
    const sessionDates = normalizeSessionDates(
      input.sessionDates ?? [],
      input.startDate,
      input.endDate,
    );
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.volunteerOpportunity.create({
        data: {
          organizationId,
          title: input.title,
          description: input.description,
          category: input.category,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          capacity: input.capacity,
          location: input.location,
          requirements: input.requirements,
          appliesToStudentService: input.appliesToStudentService ?? false,
          sessionDates: asDates(sessionDates),
        },
      });
      return toOpportunity(row);
    });
  }

  async update(
    id: string,
    input: UpdateVolunteerOpportunityInput,
    actor?: RequestUser,
  ): Promise<VolunteerOpportunity & { notifiedVolunteers: number }> {
    const organizationId = this.requireOrgId();
    const { rescheduleReason, ...changes } = input;
    const result = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.volunteerOpportunity.findUnique({ where: { id } });
      if (!existing || existing.organizationId !== organizationId) {
        throw new NotFoundException('Volunteer opportunity not found');
      }
      if (existing.status === VolunteerOpportunityStatus.Cancelled) {
        throw new ConflictException(
          'Esta jornada fue cancelada: ya no se puede editar. Publica una nueva si vuelve a realizarse.',
        );
      }
      // Cambiar SOLO una de las dos fechas no puede dejar el fin antes del inicio.
      if (input.startDate || input.endDate) {
        const error = dateOrderError(
          input.startDate ?? existing.startDate.toISOString(),
          input.endDate ?? existing.endDate.toISOString(),
          { start: 'La fecha de inicio', end: 'La fecha de fin' },
          { strict: true },
        );
        if (error) throw new BadRequestException(error);
      }
      // Los días de jornada siempre quedan dentro de las fechas (las nuevas o
      // las guardadas): mover el inicio o el fin no deja días habilitados
      // fuera de la convocatoria.
      const sessionDates =
        input.sessionDates || input.startDate || input.endDate
          ? normalizeSessionDates(
              input.sessionDates ?? existing.sessionDates.map(toDay),
              input.startDate ?? existing.startDate.toISOString(),
              input.endDate ?? existing.endDate.toISOString(),
            )
          : undefined;
      // ¿Cambió el calendario? Entonces es una REPROGRAMACIÓN: las horas ya
      // registradas no pueden quedar por fuera y se avisa a los inscritos.
      const oldDays = existing.sessionDates.map(toDay);
      const newStart = input.startDate ? new Date(input.startDate) : existing.startDate;
      const newEnd = input.endDate ? new Date(input.endDate) : existing.endDate;
      const newDays = sessionDates ?? oldDays;
      const rescheduled =
        toDay(newStart) !== toDay(existing.startDate) ||
        toDay(newEnd) !== toDay(existing.endDate) ||
        newDays.join(',') !== oldDays.join(',');
      if (rescheduled) {
        const logged = await tx.serviceHours.findMany({
          where: { enrollment: { opportunityId: id }, status: { not: 'rejected' } },
          select: { date: true },
        });
        const outside = hoursLeftOutside(
          logged.map((h) => toDay(h.date)),
          toDay(newStart),
          toDay(newEnd),
          newDays,
        );
        if (outside) {
          throw new ConflictException(
            `Ya hay horas registradas el ${formatDayEs(outside)}: ese día debe seguir siendo parte de la jornada. ` +
              'Reprograma solo los días que aún no han ocurrido.',
          );
        }
      }
      const row = await tx.volunteerOpportunity.update({
        where: { id },
        data: {
          title: changes.title,
          description: changes.description,
          category: changes.category,
          startDate: changes.startDate ? new Date(changes.startDate) : undefined,
          endDate: changes.endDate ? new Date(changes.endDate) : undefined,
          capacity: changes.capacity,
          location: changes.location,
          requirements: changes.requirements,
          status: changes.status,
          sessionDates: sessionDates ? asDates(sessionDates) : undefined,
        },
      });
      const recipients = rescheduled
        ? await tx.volunteerEnrollment.findMany({
            where: { opportunityId: id, status: { in: OPEN_ENROLLMENT_STATUSES } },
            select: { id: true, volunteerName: true, volunteerEmail: true, volunteerUserId: true },
          })
        : [];
      if (rescheduled && actor) {
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId: actor.id,
          action: 'volunteering.opportunity_rescheduled',
          entityType: 'volunteer_opportunity',
          entityId: id,
          metadata: {
            from: { start: toDay(existing.startDate), end: toDay(existing.endDate), days: oldDays },
            to: { start: toDay(newStart), end: toDay(newEnd), days: newDays },
            notified: recipients.length,
          },
        });
      }
      const organization = rescheduled
        ? await tx.organization.findUnique({
            where: { id: organizationId },
            select: { name: true },
          })
        : null;
      return { row, recipients, organizationName: organization?.name ?? '' };
    });

    for (const recipient of result.recipients) {
      const emailInput = {
        volunteerName: recipient.volunteerName,
        opportunityTitle: result.row.title,
        organizationName: result.organizationName,
        dates: describeOpportunityDates(result.row.startDate, result.row.endDate),
        sessionDays: describeSessionDays(result.row.sessionDates.map(toDay)),
        reason: rescheduleReason?.trim() || undefined,
      };
      await this.sendSafely(recipient.volunteerEmail, {
        subject: buildOpportunityRescheduledSubject(emailInput),
        body: buildOpportunityRescheduledBody(emailInput),
        template: {
          event: 'volunteering.opportunity_rescheduled',
          organizationName: emailInput.organizationName || undefined,
          organizationId,
          data: {
            nombre: emailInput.volunteerName,
            oportunidad: emailInput.opportunityTitle,
            organizacion: emailInput.organizationName,
            fechas: emailInput.dates,
            dias: emailInput.sessionDays,
            motivo: emailInput.reason ?? 'La organización no indicó un motivo.',
          },
        },
      });
      await this.inbox.toUser(recipient.volunteerUserId, {
        kind: 'volunteering.opportunity_rescheduled',
        tone: 'info',
        title: `Cambió la fecha de "${result.row.title}"`,
        body: `Ahora es ${emailInput.dates}.${emailInput.reason ? ` Motivo: ${emailInput.reason}` : ''}`,
        href: `/voluntariado?foco=${recipient.id}`,
      });
    }
    // Forma de siempre (contrato aditivo) + a cuántas personas se avisó.
    return { ...toOpportunity(result.row), notifiedVolunteers: result.recipients.length };
  }

  /**
   * Cancela una jornada publicada. No se borra (sus inscripciones y su rastro
   * de auditoría deben sobrevivir): queda `cancelled` con su motivo, sale de
   * los listados públicos, sus inscripciones abiertas pasan a `cancelled` y
   * cada persona recibe un correo con el motivo. Si ya hay horas registradas
   * no se cancela: ese trabajo existe y debe poder certificarse (se cierra la
   * convocatoria o se reprograman los días que faltan).
   */
  async cancel(
    id: string,
    input: CancelVolunteerOpportunityInput,
    actor: RequestUser,
  ): Promise<VolunteerOpportunityChangeResult> {
    const organizationId = this.requireOrgId();
    const reason = input.reason.trim();
    const result = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.volunteerOpportunity.findUnique({ where: { id } });
      if (!existing || existing.organizationId !== organizationId) {
        throw new NotFoundException('Volunteer opportunity not found');
      }
      if (existing.status === VolunteerOpportunityStatus.Cancelled) {
        throw new ConflictException('Esta jornada ya estaba cancelada.');
      }
      const logged = await tx.serviceHours.count({
        where: { enrollment: { opportunityId: id }, status: { not: 'rejected' } },
      });
      if (logged > 0) {
        throw new ConflictException(
          'Ya hay horas registradas en esta jornada, así que no se puede cancelar: ese trabajo debe ' +
            'poder certificarse. Cierra la convocatoria o reprograma los días que aún no han ocurrido.',
        );
      }
      const recipients = await tx.volunteerEnrollment.findMany({
        where: { opportunityId: id, status: { in: OPEN_ENROLLMENT_STATUSES } },
        select: { id: true, volunteerName: true, volunteerEmail: true, volunteerUserId: true },
      });
      const now = new Date();
      await tx.volunteerEnrollment.updateMany({
        where: { opportunityId: id, status: { in: OPEN_ENROLLMENT_STATUSES } },
        data: {
          status: VolunteerEnrollmentStatus.Cancelled,
          rejectionReason: `Jornada cancelada por la organización: ${reason}`,
          decidedByUserId: actor.id,
          decidedAt: now,
        },
      });
      const row = await tx.volunteerOpportunity.update({
        where: { id },
        data: {
          status: VolunteerOpportunityStatus.Cancelled,
          cancelledAt: now,
          cancellationReason: reason,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'volunteering.opportunity_cancelled',
        entityType: 'volunteer_opportunity',
        entityId: id,
        metadata: { notified: recipients.length, enrollments: recipients.map((r) => r.id) },
      });
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      });
      return { row, recipients, organizationName: organization?.name ?? '' };
    });

    for (const recipient of result.recipients) {
      const emailInput = {
        volunteerName: recipient.volunteerName,
        opportunityTitle: result.row.title,
        organizationName: result.organizationName,
        reason,
      };
      await this.sendSafely(recipient.volunteerEmail, {
        subject: buildOpportunityCancelledSubject(emailInput),
        body: buildOpportunityCancelledBody(emailInput),
        template: {
          event: 'volunteering.opportunity_cancelled',
          organizationName: emailInput.organizationName || undefined,
          organizationId,
          data: {
            nombre: emailInput.volunteerName,
            oportunidad: emailInput.opportunityTitle,
            organizacion: emailInput.organizationName,
            motivo: reason,
          },
        },
      });
      await this.inbox.toUser(recipient.volunteerUserId, {
        kind: 'volunteering.opportunity_cancelled',
        tone: 'info',
        title: `"${result.row.title}" fue cancelada`,
        body: `Motivo: ${reason}`,
        href: `/voluntariado?foco=${recipient.id}`,
        dedupeKey: `volunteer_opportunity_cancelled:${id}:${recipient.volunteerUserId}`,
      });
    }
    return { opportunity: toOpportunity(result.row), notifiedVolunteers: result.recipients.length };
  }

  /** Un correo que no sale nunca deshace el cambio ya guardado. */
  private async sendSafely(
    to: string,
    message: Omit<Parameters<NotificationPort['send']>[0], 'to'>,
  ): Promise<void> {
    try {
      await this.notifications.send({ to, ...message });
    } catch (error) {
      this.logger.warn(`No se pudo avisar a una persona inscrita: ${(error as Error).message}`);
    }
  }

  async list(limit: number, offset: number): Promise<Paginated<VolunteerOpportunity>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const where = { organizationId };
      const [rows, total] = await Promise.all([
        tx.volunteerOpportunity.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
        tx.volunteerOpportunity.count({ where }),
      ]);
      return { items: rows.map(toOpportunity), total, limit: take, offset: skip };
    });
  }

  async get(id: string): Promise<VolunteerOpportunity> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.volunteerOpportunity.findUnique({ where: { id } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Volunteer opportunity not found');
    }
    return toOpportunity(row);
  }

  /** PUBLIC (no session): active opportunities of ONE org, by its portal slug. */
  async listPublicByOrgSlug(
    slug: string,
    limit: number,
    offset: number,
  ): Promise<Paginated<VolunteerOpportunityPublic> | null> {
    const orgRows = await this.prisma.$queryRaw<Array<{ data: RawPublicOrg | null }>>(
      Prisma.sql`SELECT organization_public(${slug}) AS data`,
    );
    const org = orgRows[0]?.data;
    if (!org) {
      return null;
    }
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(org.id, async (tx) => {
      // Igual que el listado nacional: solo jornadas abiertas (activas y cuya
      // fecha de fin no ha pasado), nunca convocatorias ya terminadas.
      const where = {
        organizationId: org.id,
        status: VolunteerOpportunityStatus.Active,
        endDate: { gte: new Date() },
      };
      const [rows, total] = await Promise.all([
        tx.volunteerOpportunity.findMany({ where, orderBy: { startDate: 'asc' }, take, skip }),
        tx.volunteerOpportunity.count({ where }),
      ]);
      return {
        items: rows.map((row) => ({
          id: row.id,
          organizationId: row.organizationId,
          organizationName: org.name,
          title: row.title,
          description: row.description ?? undefined,
          category: row.category,
          startDate: row.startDate.toISOString(),
          endDate: row.endDate.toISOString(),
          capacity: row.capacity ?? undefined,
          location: row.location,
          requirements: row.requirements ?? undefined,
          appliesToStudentService: row.appliesToStudentService,
          sessionDates: row.sessionDates.map(toDay),
        })),
        total,
        limit: take,
        offset: skip,
      };
    });
  }

  /** PUBLIC (no session): active opportunities across ALL organizations —
   *  the global feed, same pattern as `public_campaigns`/`public_animals`. */
  async listPublic(limit: number, offset: number): Promise<Paginated<VolunteerOpportunityPublic>> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: VolunteerOpportunityPublic[]; total: number } }>
    >(Prisma.sql`SELECT public_volunteer_opportunities(${take}::int, ${skip}::int) AS data`);
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return { items: data.items ?? [], total: data.total ?? 0, limit: take, offset: skip };
  }
}
