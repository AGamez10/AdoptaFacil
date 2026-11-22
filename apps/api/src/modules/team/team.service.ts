import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type AnimalCareLog,
  type AnimalSex,
  type AnimalSize,
  type AnimalSpecies,
  type AnimalStatus,
  type CareAnimalCard,
  CARE_LOG_KIND_LABELS,
  type CareLogKind,
  type CreateAnimalCareLogInput,
  type CreateTeamAssignmentInput,
  type MemberPermission,
  type MyMemberPermissions,
  type MyTeamWork,
  type Role,
  type TeamAssignee,
  type TeamAssignment,
  type TeamAssignmentKind,
  type TeamAssignmentStatus,
  TEAM_WORK_ROLES,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { InboxService } from '../../core/notifications/inbox/inbox.service';
import { memberPermissionsOf, orgRolesOf } from '../../core/rbac/member-permissions';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { computeAge } from '../animals/animal-age';

/** Solo lo básico del animal: lo que necesita quien lo cuida. Nada de
 *  adoptantes, donantes, responsables de custodia ni historia clínica. */
const CARE_ANIMAL_SELECT = {
  id: true,
  name: true,
  species: true,
  sex: true,
  size: true,
  status: true,
  birthDate: true,
  approximateAgeMonths: true,
  description: true,
  tags: true,
  customBreed: true,
  breed: { select: { name: true } },
  photos: { select: { storageRef: true, order: true }, orderBy: { order: 'asc' }, take: 1 },
} satisfies Prisma.AnimalSelect;

type CareAnimalRow = Prisma.AnimalGetPayload<{ select: typeof CARE_ANIMAL_SELECT }>;

const ASSIGNMENT_INCLUDE = {
  animal: { select: CARE_ANIMAL_SELECT },
} satisfies Prisma.TeamAssignmentInclude;

type AssignmentRow = Prisma.TeamAssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;

/** Lo hecho se sigue viendo un mes en "Mi trabajo". */
const DONE_VISIBLE_DAYS = 30;
/** Un cuidado se registra el mismo día o poco después, nunca en el futuro. */
const CARE_LOG_MAX_AGE_DAYS = 7;
const CLOSED_ANIMAL_STATUSES = ['deceased', 'adopted'];

const toDbDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const fromDbDate = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * Trabajo del equipo por cargo: tareas y animales a cargo de cada persona y la
 * bitácora de cuidados (decisión del dueño, 2026-11-22). El voluntario ve aquí
 * su panel mínimo: lo que le encargaron y la ficha básica de los animales que
 * cuida, nunca datos de adoptantes ni donantes. Todo corre bajo el contexto
 * del tenant (RLS) y lo que cambia queda en la auditoría.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Optional() private readonly inbox?: InboxService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  // --- Proyecciones -----------------------------------------------------------

  private toCard(row: CareAnimalRow): CareAnimalCard {
    const photo = row.photos[0];
    const breed = row.breed?.name ?? row.customBreed ?? undefined;
    const computedAge = computeAge(row.birthDate, row.approximateAgeMonths, new Date());
    return {
      id: row.id,
      name: row.name,
      species: row.species as AnimalSpecies,
      sex: row.sex as AnimalSex,
      size: row.size as AnimalSize,
      status: row.status as AnimalStatus,
      tags: row.tags,
      ...(breed ? { breed } : {}),
      ...(computedAge ? { computedAge } : {}),
      ...(row.description ? { description: row.description } : {}),
      ...(photo ? { photoUrl: this.storage.resolvePublicUrl(photo.storageRef) } : {}),
    };
  }

  private async namesOf(
    tx: Prisma.TransactionClient,
    ids: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const users = await tx.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  private toAssignment(row: AssignmentRow, names: Map<string, string>): TeamAssignment {
    return {
      id: row.id,
      kind: row.kind as TeamAssignmentKind,
      status: row.status as TeamAssignmentStatus,
      title: row.title,
      ...(row.details ? { details: row.details } : {}),
      ...(row.dueDate ? { dueDate: fromDbDate(row.dueDate) } : {}),
      assigneeUserId: row.assigneeUserId,
      assigneeName: names.get(row.assigneeUserId) ?? 'Persona del equipo',
      ...(row.animal ? { animal: this.toCard(row.animal) } : {}),
      createdByName: names.get(row.createdByUserId) ?? 'El equipo',
      createdAt: row.createdAt.toISOString(),
      ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
      ...(row.completionNote ? { completionNote: row.completionNote } : {}),
    };
  }

  private async toAssignments(
    tx: Prisma.TransactionClient,
    rows: AssignmentRow[],
  ): Promise<TeamAssignment[]> {
    const names = await this.namesOf(
      tx,
      rows.flatMap((r) => [r.assigneeUserId, r.createdByUserId]),
    );
    return rows.map((row) => this.toAssignment(row, names));
  }

  private async toLogs(
    tx: Prisma.TransactionClient,
    rows: Array<{
      id: string;
      animalId: string;
      kind: string;
      note: string | null;
      occurredAt: Date;
      authorUserId: string;
      createdAt: Date;
    }>,
  ): Promise<AnimalCareLog[]> {
    const names = await this.namesOf(
      tx,
      rows.map((r) => r.authorUserId),
    );
    return rows.map((row) => ({
      id: row.id,
      animalId: row.animalId,
      kind: row.kind as CareLogKind,
      ...(row.note ? { note: row.note } : {}),
      occurredAt: row.occurredAt.toISOString(),
      authorName: names.get(row.authorUserId) ?? 'Persona del equipo',
      createdAt: row.createdAt.toISOString(),
    }));
  }

  // --- Quien encarga (propietario, administrador, operador) --------------------

  /** Personas del equipo a quienes se les puede encargar algo. */
  async listAssignees(): Promise<TeamAssignee[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const roles = await tx.userRole.findMany({
        where: { organizationId, role: { in: [...TEAM_WORK_ROLES] } },
        select: { userId: true, role: true },
      });
      const byUser = new Map<string, Role[]>();
      for (const row of roles) {
        byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.role as Role]);
      }
      const names = await this.namesOf(tx, [...byUser.keys()]);
      return [...byUser.entries()]
        .map(([userId, userRoles]) => ({
          userId,
          displayName: names.get(userId) ?? 'Persona del equipo',
          roles: userRoles,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
    });
  }

  async list(
    filter: { assigneeUserId?: string; status?: TeamAssignmentStatus } = {},
  ): Promise<TeamAssignment[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const rows = await tx.teamAssignment.findMany({
        where: {
          organizationId,
          status: filter.status ?? 'open',
          ...(filter.assigneeUserId ? { assigneeUserId: filter.assigneeUserId } : {}),
        },
        include: ASSIGNMENT_INCLUDE,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 300,
      });
      return this.toAssignments(tx, rows);
    });
  }

  async create(actorUserId: string, input: CreateTeamAssignmentInput): Promise<TeamAssignment> {
    const organizationId = this.requireOrgId();
    const created = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const assigneeRoles = await orgRolesOf(tx, organizationId, input.assigneeUserId);
      if (!assigneeRoles.some((role) => (TEAM_WORK_ROLES as readonly Role[]).includes(role))) {
        throw new BadRequestException(
          'Solo se le encarga trabajo a una persona del equipo con un cargo operativo.',
        );
      }
      let animalName: string | undefined;
      if (input.animalId) {
        const animal = await tx.animal.findUnique({
          where: { id: input.animalId },
          select: { id: true, name: true, status: true },
        });
        if (!animal) throw new NotFoundException('Animal no encontrado.');
        if (CLOSED_ANIMAL_STATUSES.includes(animal.status)) {
          throw new ConflictException('Este animal ya no está en la organización.');
        }
        animalName = animal.name;
      }
      if (input.kind === 'animal_care') {
        const already = await tx.teamAssignment.findFirst({
          where: {
            organizationId,
            kind: 'animal_care',
            status: 'open',
            assigneeUserId: input.assigneeUserId,
            animalId: input.animalId,
          },
          select: { id: true },
        });
        if (already) {
          throw new ConflictException('Esta persona ya tiene a este animal a su cargo.');
        }
      }
      const title =
        input.title?.trim() ||
        (input.kind === 'animal_care' && animalName ? `Cuidar a ${animalName}` : '');
      if (title.length < 2) throw new BadRequestException('Escribe la tarea.');
      const row = await tx.teamAssignment.create({
        data: {
          organizationId,
          kind: input.kind,
          assigneeUserId: input.assigneeUserId,
          animalId: input.animalId ?? null,
          title,
          details: input.details?.trim() || null,
          dueDate: input.dueDate ? toDbDate(input.dueDate) : null,
          createdByUserId: actorUserId,
        },
        include: ASSIGNMENT_INCLUDE,
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'team.assignment_created',
        entityType: 'team_assignment',
        entityId: row.id,
        metadata: {
          kind: input.kind,
          assigneeUserId: input.assigneeUserId,
          ...(input.animalId ? { animalId: input.animalId } : {}),
        },
      });
      const [view] = await this.toAssignments(tx, [row]);
      return view as TeamAssignment;
    });
    if (created.assigneeUserId !== actorUserId) {
      await this.inbox?.toUser(created.assigneeUserId, {
        kind: 'team.assignment',
        tone: 'info',
        title:
          created.kind === 'animal_care'
            ? `${created.animal?.name ?? 'Un animal'} queda a tu cargo`
            : `Nueva tarea: ${created.title}`,
        body: `${created.createdByName} te lo encargó${
          created.dueDate ? ` para el ${created.dueDate}` : ''
        }.`,
        href: '/mi-trabajo',
        dedupeKey: `team_assignment:${created.id}`,
      });
    }
    return created;
  }

  async cancel(actorUserId: string, id: string): Promise<TeamAssignment> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.teamAssignment.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Encargo no encontrado.');
      if (row.status !== 'open') {
        throw new ConflictException('Este encargo ya está cerrado.');
      }
      const updated = await tx.teamAssignment.update({
        where: { id },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelledByUserId: actorUserId },
        include: ASSIGNMENT_INCLUDE,
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'team.assignment_cancelled',
        entityType: 'team_assignment',
        entityId: id,
        metadata: { kind: row.kind, assigneeUserId: row.assigneeUserId },
      });
      const [view] = await this.toAssignments(tx, [updated]);
      return view as TeamAssignment;
    });
  }

  /** Bitácora de cuidados de un animal (para quien lleva su ficha). */
  async careLogs(animalId: string): Promise<AnimalCareLog[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const animal = await tx.animal.findUnique({ where: { id: animalId }, select: { id: true } });
      if (!animal) throw new NotFoundException('Animal no encontrado.');
      const rows = await tx.animalCareLog.findMany({
        where: { organizationId, animalId },
        orderBy: { occurredAt: 'desc' },
        take: 100,
      });
      return this.toLogs(tx, rows);
    });
  }

  // --- La propia persona ("Mi trabajo") -----------------------------------------

  async myPermissions(actorUserId: string): Promise<MyMemberPermissions> {
    const organizationId = this.requireOrgId();
    const permissions: MemberPermission[] = await this.prisma.withOrgContext(organizationId, (tx) =>
      memberPermissionsOf(tx, organizationId, actorUserId),
    );
    return { permissions };
  }

  async myWork(actorUserId: string): Promise<MyTeamWork> {
    const organizationId = this.requireOrgId();
    const since = new Date(Date.now() - DONE_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const rows = await tx.teamAssignment.findMany({
        where: {
          organizationId,
          assigneeUserId: actorUserId,
          OR: [{ status: 'open' }, { status: 'done', completedAt: { gte: since } }],
        },
        include: ASSIGNMENT_INCLUDE,
        orderBy: [{ status: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      });
      const assignments = await this.toAssignments(tx, rows);
      const seen = new Set<string>();
      const animals: CareAnimalCard[] = [];
      for (const a of assignments) {
        if (a.kind !== 'animal_care' || a.status !== 'open' || !a.animal) continue;
        if (seen.has(a.animal.id)) continue;
        seen.add(a.animal.id);
        animals.push(a.animal);
      }
      return { assignments, animals };
    });
  }

  async complete(actorUserId: string, id: string, note?: string): Promise<TeamAssignment> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.teamAssignment.findUnique({ where: { id } });
      // Lo de otra persona "no existe" para quien pregunta.
      if (!row || row.assigneeUserId !== actorUserId) {
        throw new NotFoundException('Encargo no encontrado.');
      }
      if (row.kind !== 'task') {
        throw new BadRequestException(
          'Un animal a cargo lo cierra quien lo asignó, cuando cambia el cuidado.',
        );
      }
      if (row.status !== 'open') {
        throw new ConflictException('Esta tarea ya está cerrada.');
      }
      const updated = await tx.teamAssignment.update({
        where: { id },
        data: {
          status: 'done',
          completedAt: new Date(),
          completedByUserId: actorUserId,
          completionNote: note?.trim() || null,
        },
        include: ASSIGNMENT_INCLUDE,
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'team.assignment_completed',
        entityType: 'team_assignment',
        entityId: id,
      });
      const [view] = await this.toAssignments(tx, [updated]);
      return view as TeamAssignment;
    });
  }

  /** El animal está a cargo de la persona (encargo abierto). Si no, "no existe". */
  private async requireMyAnimal(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorUserId: string,
    animalId: string,
  ): Promise<void> {
    const assignment = await tx.teamAssignment.findFirst({
      where: {
        organizationId,
        kind: 'animal_care',
        status: 'open',
        assigneeUserId: actorUserId,
        animalId,
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new NotFoundException('Este animal no está a tu cargo.');
    }
  }

  async myCareLogs(actorUserId: string, animalId: string): Promise<AnimalCareLog[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.requireMyAnimal(tx, organizationId, actorUserId, animalId);
      const rows = await tx.animalCareLog.findMany({
        where: { organizationId, animalId },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      });
      return this.toLogs(tx, rows);
    });
  }

  async addCareLog(
    actorUserId: string,
    animalId: string,
    input: CreateAnimalCareLogInput,
  ): Promise<AnimalCareLog> {
    const organizationId = this.requireOrgId();
    const now = new Date();
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : now;
    if (occurredAt.getTime() > now.getTime() + 5 * 60 * 1000) {
      throw new BadRequestException('Un cuidado no se registra en el futuro.');
    }
    if (now.getTime() - occurredAt.getTime() > CARE_LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        `Registra el cuidado dentro de los ${CARE_LOG_MAX_AGE_DAYS} días siguientes.`,
      );
    }
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.requireMyAnimal(tx, organizationId, actorUserId, animalId);
      const row = await tx.animalCareLog.create({
        data: {
          organizationId,
          animalId,
          authorUserId: actorUserId,
          kind: input.kind,
          note: input.note?.trim() || null,
          occurredAt,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.care_logged',
        entityType: 'animal',
        entityId: animalId,
        metadata: { kind: input.kind, label: CARE_LOG_KIND_LABELS[input.kind] },
      });
      const [view] = await this.toLogs(tx, [row]);
      return view as AnimalCareLog;
    });
  }
}
