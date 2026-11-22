import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Animal as AnimalRow,
  AnimalBreed as BreedRow,
  AnimalPhoto as PhotoRow,
} from '@prisma/client';
import {
  type Animal,
  ANIMAL_DECEASED_SUSPENSION_REASON,
  type AnimalBreed,
  type AnimalPhoto,
  type AnimalPhotoUploadResult,
  type AnimalSex,
  type AnimalSize,
  type AnimalSpecies,
  type AnimalStatus,
  type CreateAnimalBreedInput,
  type CreateAnimalInput,
  PUBLIC_ANIMAL_STATUSES,
  type SetAdoptionReadinessInput,
  SponsorshipStatus,
  type UpdateAnimalInput,
} from '@adoptafacil/contracts';
import type {
  NotificationPort,
  NotificationTemplateRequest,
} from '../../core/notifications/notification.port';
import { NOTIFICATION_PORT } from '../../core/notifications/notification.port';
import { AuditService } from '../../core/audit/audit.service';
import { canPublishAnimals } from '../../core/rbac/member-permissions';
import { InboxService } from '../../core/notifications/inbox/inbox.service';
import { isUniqueConstraintViolation } from '../../core/errors/prisma-conflict.util';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { SponsorshipsService } from '../sponsorships/sponsorships.service';
import { computeAge } from './animal-age';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';

type AnimalWithRelations = AnimalRow & { photos: PhotoRow[]; breed: BreedRow | null };

/** Adoption request statuses that block a delete/soft-remove (RF07 §3.4). */
/** Estado con el que queda la ficha que crea quien no publica: guardada, fuera
 *  del portal, hasta que alguien con permiso la publique. */
const UNPUBLISHED_STATUS: AnimalStatus = 'unavailable';

const NOT_PUBLISHER_MESSAGE =
  'Publicar o retirar un animal del portal lo hace un administrador u operador. ' +
  'Puedes marcarlo como apto para adopción para avisarles.';

const ACTIVE_ADOPTION_STATUSES = ['new', 'in_review', 'approved'] as const;

/** Row from `sponsorship_active_sponsors_for_animal()` (M07 hallazgo QA, raw
 *  SQL SECURITY DEFINER — see the migration's header comment). */
interface ActiveSponsorRow {
  sponsorship_id: string;
  sponsor_user_id: string;
  sponsor_email: string;
}

@Injectable()
export class AnimalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly sponsorships: SponsorshipsService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Optional() private readonly inbox?: InboxService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  private toPhoto(row: PhotoRow): AnimalPhoto {
    return {
      id: row.id,
      storageRef: row.storageRef,
      order: row.order,
      url: this.storage.resolvePublicUrl(row.storageRef),
    };
  }

  /** Nombres de quienes marcaron "apto para adopción" (mismo tenant, RLS). */
  private async readyNames(
    tx: Prisma.TransactionClient,
    rows: Array<{ adoptionReadyBy: string | null }>,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.adoptionReadyBy).filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();
    const users = await tx.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  private toAnimal(row: AnimalWithRelations, readyNames?: Map<string, string>): Animal {
    const photos = [...row.photos].sort((a, b) => a.order - b.order).map((p) => this.toPhoto(p));
    const breedName = row.breed?.name ?? row.customBreed ?? undefined;
    const computedAge = computeAge(row.birthDate, row.approximateAgeMonths, new Date());
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      species: row.species as AnimalSpecies,
      sex: row.sex as AnimalSex,
      size: row.size as AnimalSize,
      status: row.status as AnimalStatus,
      photos: photos.map((p) => p.url),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      breed: breedName,
      birthDate: row.birthDate?.toISOString(),
      approximateAgeMonths: row.approximateAgeMonths ?? undefined,
      description: row.description ?? undefined,
      breedId: row.breedId ?? undefined,
      customBreed: row.customBreed ?? undefined,
      tags: row.tags,
      computedAge,
      isActive: row.isActive,
      photoRecords: photos,
      ...(row.adoptionReadyAt
        ? {
            adoptionReadyAt: row.adoptionReadyAt.toISOString(),
            adoptionReadyByName: row.adoptionReadyBy
              ? readyNames?.get(row.adoptionReadyBy)
              : undefined,
            adoptionReadyNote: row.adoptionReadyNote ?? undefined,
          }
        : {}),
    };
  }

  /** Validate that a referenced breed exists in the caller's org and matches the
   *  species (RLS already scopes visibility to the tenant). */
  private async assertBreed(
    tx: Prisma.TransactionClient,
    breedId: string,
    species: string,
  ): Promise<void> {
    const breed = await tx.animalBreed.findUnique({ where: { id: breedId } });
    if (!breed) {
      throw new BadRequestException('Breed not found in this organization');
    }
    if (breed.species !== species) {
      throw new BadRequestException('Breed species does not match the animal species');
    }
  }

  // --- Animals ---------------------------------------------------------------

  /** Create an animal record (expediente) with attributes, status and photos.
   *  Starts active; audited. */
  async create(actorUserId: string, input: CreateAnimalInput): Promise<Animal> {
    const organizationId = this.requireOrgId();

    // Reserve storage targets OUTSIDE the tx (the stub is pure, but a real
    // adapter would do I/O we do not want to hold a DB transaction open for).
    const reserved = await Promise.all(
      (input.photos ?? []).map(async (photo, index) => ({
        storageRef: (
          await this.storage.createUploadTarget({
            organizationId,
            filename: photo.filename,
            contentType: photo.contentType,
            // Animal photos are public (shown in the public adoption catalog, T-029).
            visibility: 'public',
          })
        ).key,
        order: photo.order ?? index,
      })),
    );

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      if (input.breedId) {
        await this.assertBreed(tx, input.breedId, input.species);
      }
      // Quien no publica (el veterinario sin permiso expreso) deja la ficha
      // guardada fuera del portal; la publica un administrador u operador.
      const publisher = await canPublishAnimals(tx, organizationId, actorUserId);
      const status = publisher ? (input.status ?? 'available') : UNPUBLISHED_STATUS;
      const animal = await tx.animal.create({
        data: {
          organizationId,
          name: input.name,
          species: input.species,
          sex: input.sex,
          size: input.size,
          status,
          breedId: input.breedId ?? null,
          customBreed: input.customBreed ?? null,
          birthDate: input.birthDate ? new Date(input.birthDate) : null,
          approximateAgeMonths: input.approximateAgeMonths ?? null,
          description: input.description ?? null,
          tags: input.tags ?? [],
          photos:
            reserved.length > 0
              ? { create: reserved.map((r) => ({ organizationId, ...r })) }
              : undefined,
        },
        include: { photos: true, breed: true },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.created',
        entityType: 'animal',
        entityId: animal.id,
        metadata: {
          species: input.species,
          status: animal.status,
          photos: reserved.length,
          ...(publisher ? {} : { awaitingPublication: true }),
        },
      });

      return this.toAnimal(animal);
    });
  }

  /** List the org's animals. By default only active records; `includeInactive`
   *  surfaces deactivated ones too. */
  async list(includeInactive = false): Promise<Animal[]> {
    const organizationId = this.requireOrgId();
    const { rows, names } = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const found = await tx.animal.findMany({
        where: { organizationId, ...(includeInactive ? {} : { isActive: true }) },
        include: { photos: true, breed: true },
        orderBy: { createdAt: 'desc' },
      });
      return { rows: found, names: await this.readyNames(tx, found) };
    });
    return rows.map((row) => this.toAnimal(row, names));
  }

  /** One animal record (including deactivated), with derived age and photos. */
  async get(id: string): Promise<Animal> {
    const organizationId = this.requireOrgId();
    const { row, names } = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const found = await tx.animal.findUnique({
        where: { id },
        include: { photos: true, breed: true },
      });
      return { row: found, names: found ? await this.readyNames(tx, [found]) : new Map() };
    });
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Animal not found');
    }
    return this.toAnimal(row, names);
  }

  /** Patch an animal record; audited. */
  async update(actorUserId: string, id: string, input: UpdateAnimalInput): Promise<Animal> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.animal.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Animal not found');
      }
      if (input.breedId) {
        await this.assertBreed(tx, input.breedId, input.species ?? existing.species);
      }
      // Clearing the birth date is only allowed when an approximate age remains.
      if (
        input.birthDate === null &&
        input.approximateAgeMonths === undefined &&
        existing.approximateAgeMonths === null
      ) {
        throw new BadRequestException('Indica la fecha de nacimiento o una edad aproximada.');
      }
      // Cambiar el estado decide si la ficha sale en el portal. Quien no
      // publica solo puede sacarla ("no disponible", p. ej. en tratamiento).
      if (
        input.status !== undefined &&
        input.status !== existing.status &&
        input.status !== UNPUBLISHED_STATUS &&
        !(await canPublishAnimals(tx, organizationId, actorUserId))
      ) {
        throw new ForbiddenException(NOT_PUBLISHER_MESSAGE);
      }
      const updated = await tx.animal.update({
        where: { id },
        data: {
          name: input.name,
          species: input.species,
          sex: input.sex,
          size: input.size,
          status: input.status,
          breedId: input.breedId,
          customBreed: input.customBreed,
          birthDate:
            input.birthDate === null
              ? null
              : input.birthDate
                ? new Date(input.birthDate)
                : undefined,
          approximateAgeMonths: input.approximateAgeMonths,
          description: input.description,
          tags: input.tags,
        },
        include: { photos: true, breed: true },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.updated',
        entityType: 'animal',
        entityId: id,
        metadata: { fields: Object.keys(input) },
      });
      return this.toAnimal(updated, await this.readyNames(tx, [updated]));
    });
  }

  /** Soft toggle activation (RF07). NEVER a physical delete; audited. */
  async setActive(actorUserId: string, id: string, isActive: boolean): Promise<Animal> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.animal.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Animal not found');
      }
      if (!(await canPublishAnimals(tx, organizationId, actorUserId))) {
        throw new ForbiddenException(NOT_PUBLISHER_MESSAGE);
      }
      const updated = await tx.animal.update({
        where: { id },
        data: { isActive },
        include: { photos: true, breed: true },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: isActive ? 'animal.activated' : 'animal.deactivated',
        entityType: 'animal',
        entityId: id,
      });
      return this.toAnimal(updated, await this.readyNames(tx, [updated]));
    });
  }

  /**
   * Marca (o desmarca) al animal "apto para adopción". Lo hace quien conoce su
   * salud, típicamente el veterinario; NO publica: avisa a quienes publican
   * (propietario, administradores, operadores) para que decidan.
   */
  async setAdoptionReadiness(
    actorUserId: string,
    id: string,
    input: SetAdoptionReadinessInput,
  ): Promise<Animal> {
    const organizationId = this.requireOrgId();
    const animal = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.animal.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Animal not found');
      }
      if (existing.status === 'deceased' || existing.status === 'adopted') {
        throw new ConflictException('Este animal ya no está en adopción.');
      }
      const note = input.ready ? input.note?.trim() || null : null;
      const updated = await tx.animal.update({
        where: { id },
        data: input.ready
          ? { adoptionReadyAt: new Date(), adoptionReadyBy: actorUserId, adoptionReadyNote: note }
          : { adoptionReadyAt: null, adoptionReadyBy: null, adoptionReadyNote: null },
        include: { photos: true, breed: true },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: input.ready ? 'animal.adoption_ready_marked' : 'animal.adoption_ready_cleared',
        entityType: 'animal',
        entityId: id,
        metadata: { hasNote: Boolean(note) },
      });
      return this.toAnimal(updated, await this.readyNames(tx, [updated]));
    });
    const published =
      animal.isActive !== false &&
      (PUBLIC_ANIMAL_STATUSES as readonly AnimalStatus[]).includes(animal.status);
    if (input.ready && !published) {
      await this.inbox?.toOrgStaff(
        organizationId,
        {
          kind: 'animals.adoption_ready',
          tone: 'success',
          title: `${animal.name} está apto para adopción`,
          body: `${animal.adoptionReadyByName ?? 'El equipo'} lo marcó apto${
            animal.adoptionReadyNote ? `: ${animal.adoptionReadyNote}` : '.'
          } Revisa su ficha y publícalo cuando esté listo.`,
          href: `/animales/${animal.id}`,
          dedupeKey: `animal_ready:${animal.id}:${animal.adoptionReadyAt ?? ''}`,
        },
        { excludeUserId: actorUserId },
      );
    }
    return animal;
  }

  /** "Delete" an animal record from the UI's perspective (S2-04A §3.4). A
   *  physical DELETE is impossible here — `animals` REVOKEs DELETE from the app
   *  role and a trigger rejects it for every role (RF07) — so this is a soft
   *  deactivation, additionally BLOCKED while an adoption request tied to this
   *  animal is still active (new/in_review/approved). Narrower roles than
   *  activate/deactivate (Owner/Administrator only); audited distinctly. */
  async remove(actorUserId: string, id: string): Promise<void> {
    const organizationId = this.requireOrgId();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.animal.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Animal not found');
      }
      const activeAdoption = await tx.adoptionRequest.findFirst({
        where: { animalId: id, status: { in: [...ACTIVE_ADOPTION_STATUSES] } },
      });
      if (activeAdoption) {
        throw new ConflictException(
          'No se puede eliminar: el animal tiene una adopción activa vinculada.',
        );
      }
      await tx.animal.update({ where: { id }, data: { isActive: false } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.removed',
        entityType: 'animal',
        entityId: id,
      });
    });
  }

  /**
   * Register an animal as deceased (M07 hallazgo QA: "Registrar fallecimiento"
   * was a `ComingSoon` placeholder with no real backend — see
   * `animal-deceased-modal.tsx`'s prior doc comment). Same role gate as
   * {@link remove} (Owner/Administrator only — a terminal, sensitive change to
   * the record, not a routine edit). Within ONE transaction:
   *   1. Marks the animal `status='deceased'` + `isActive=false` (same
   *      "no longer in adoption" flag `setActive`/`remove` already use).
   *   2. Suspends every ACTIVE sponsorship of this animal via
   *      `SponsorshipsService.applySystemTransition` — the SAME method/reason
   *      pattern `sponsorship-billing.service.ts` uses for its own
   *      system-triggered suspension (billing failure), just with
   *      {@link ANIMAL_DECEASED_SUSPENSION_REASON} instead. Sponsorships that
   *      are already suspended/cancelled are left untouched (only `active`
   *      rows are looked up in the first place).
   *   3. Audits `animal.deceased` with the affected-sponsorship COUNT only
   *      (never sponsor PII) in metadata.
   * Sponsor emails for the affected sponsorships are resolved INSIDE the same
   * transaction (AFTER confirming the animal belongs to the caller's org —
   * never before, so a request for another org's animal id never triggers the
   * cross-tenant read at all) via the bounded
   * `sponsorship_active_sponsors_for_animal` SECURITY DEFINER function (a
   * sponsor is a Person outside this org, so their email sits behind `users`'
   * RLS — same cross-tenant-read rationale as `sponsorships_due_for_billing()`),
   * then notified BEST-EFFORT after commit (same "notify outside the tx"
   * convention as the billing service) with an honest message: no promised
   * refund or automatic reassignment — those stay TODO(client), exactly as the
   * modal already documented.
   */
  async registerDeath(actorUserId: string, id: string): Promise<Animal> {
    const organizationId = this.requireOrgId();

    const { animal, activeSponsors } = await this.prisma.withOrgContext(
      organizationId,
      async (tx) => {
        const existing = await tx.animal.findUnique({ where: { id } });
        if (!existing || existing.organizationId !== organizationId) {
          throw new NotFoundException('Animal not found');
        }

        const updated = await tx.animal.update({
          where: { id },
          data: { status: 'deceased', isActive: false },
          include: { photos: true, breed: true },
        });

        const sponsors = await tx.$queryRaw<ActiveSponsorRow[]>(
          Prisma.sql`SELECT * FROM sponsorship_active_sponsors_for_animal(${id}::uuid)`,
        );

        for (const sponsor of sponsors) {
          await this.sponsorships.applySystemTransition(
            tx,
            organizationId,
            sponsor.sponsorship_id,
            SponsorshipStatus.Suspended,
            ANIMAL_DECEASED_SUSPENSION_REASON,
          );
        }

        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'animal.deceased',
          entityType: 'animal',
          entityId: id,
          metadata: { affectedSponsorshipsCount: sponsors.length },
        });

        return { animal: this.toAnimal(updated), activeSponsors: sponsors };
      },
    );

    const organizationName = activeSponsors.length
      ? await this.organizationNameBestEffort(organizationId)
      : undefined;
    for (const sponsor of activeSponsors) {
      await this.notifyBestEffort(
        sponsor.sponsor_email,
        'Un animal que apadrinas falleció',
        `${animal.name} falleció y tu apadrinamiento fue suspendido. La organización se pondrá en contacto contigo.`,
        {
          event: 'sponsorship.animal_deceased',
          organizationName,
          data: { animal: animal.name, organizacion: organizationName ?? 'La organización' },
        },
      );
      await this.inbox?.toUser(sponsor.sponsor_user_id, {
        kind: 'sponsorships.animal_deceased',
        tone: 'info',
        title: `${animal.name} falleció`,
        body: `Gracias por acompañarle. Tu apadrinamiento quedó suspendido y no se te cobrará más. ${organizationName ?? 'La organización'} se pondrá en contacto contigo.`,
        href: `/apadrinar?foco=${sponsor.sponsorship_id}`,
        dedupeKey: `sponsorship_animal_deceased:${sponsor.sponsorship_id}`,
      });
    }

    return animal;
  }

  /** Best-effort notification — a delivery failure never fails the request
   *  (same convention as `SponsorshipBillingService.notifyBestEffort`). */
  private async organizationNameBestEffort(organizationId: string): Promise<string | undefined> {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      });
      return org?.name ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async notifyBestEffort(
    to: string,
    subject: string,
    body: string,
    template?: NotificationTemplateRequest,
  ): Promise<void> {
    try {
      await this.notifications.send({ to, subject, body, template });
    } catch {
      // Best-effort: the death registration already succeeded; a notification
      // failure must not roll it back or surface as a request error.
    }
  }

  // --- Photos ----------------------------------------------------------------

  /** Attach a photo to an animal (metadata only); audited. */
  async addPhoto(
    actorUserId: string,
    animalId: string,
    input: { filename: string; contentType?: string; order?: number },
  ): Promise<AnimalPhotoUploadResult> {
    const organizationId = this.requireOrgId();
    const stored = await this.storage.createUploadTarget({
      organizationId,
      filename: input.filename,
      contentType: input.contentType,
      // Animal photos are public (shown in the public adoption catalog, T-029).
      visibility: 'public',
    });
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const animal = await tx.animal.findUnique({ where: { id: animalId } });
      if (!animal) {
        throw new NotFoundException('Animal not found');
      }
      const order =
        input.order ??
        ((await tx.animalPhoto.aggregate({ where: { animalId }, _max: { order: true } }))._max
          .order ?? -1) + 1;
      const row = await tx.animalPhoto.create({
        data: { organizationId, animalId, storageRef: stored.key, order },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.photo_added',
        entityType: 'animal',
        entityId: animalId,
        metadata: { order },
      });
      return { photo: this.toPhoto(row), upload: { url: stored.url, key: stored.key } };
    });
  }

  /** Remove a photo from an animal; audited. (The animal record itself is never
   *  physically deleted.) */
  async removePhoto(actorUserId: string, animalId: string, photoId: string): Promise<void> {
    const organizationId = this.requireOrgId();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const photo = await tx.animalPhoto.findUnique({ where: { id: photoId } });
      if (!photo || photo.animalId !== animalId) {
        throw new NotFoundException('Photo not found');
      }
      await tx.animalPhoto.delete({ where: { id: photoId } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.photo_removed',
        entityType: 'animal',
        entityId: animalId,
        metadata: { photoId },
      });
    });
  }

  // --- Breeds ----------------------------------------------------------------

  /** List the org's custom breeds, optionally filtered by species. */
  async listBreeds(species?: string): Promise<AnimalBreed[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.animalBreed.findMany({
        where: { organizationId, ...(species ? { species } : {}) },
        orderBy: { name: 'asc' },
      }),
    );
    return rows.map(toBreed);
  }

  /** Create a tenant-scoped custom breed; audited. Duplicate (species+name) → 409. */
  async createBreed(actorUserId: string, input: CreateAnimalBreedInput): Promise<AnimalBreed> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.animalBreed.findFirst({
        where: { organizationId, species: input.species, name: input.name },
      });
      if (existing) {
        throw new ConflictException('That breed already exists for this species');
      }
      let row: BreedRow;
      try {
        row = await tx.animalBreed.create({
          data: { organizationId, species: input.species, name: input.name },
        });
      } catch (error) {
        // Defense-in-depth for the race window the pre-check above can't close
        // (two concurrent requests both pass `findFirst` before either
        // `create`s) — same "no global exception filter" gap as org-profile's
        // slug/subdomain, see core/errors/prisma-conflict.util.ts.
        if (isUniqueConstraintViolation(error)) {
          throw new ConflictException('That breed already exists for this species');
        }
        throw error;
      }
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.breed_created',
        entityType: 'animal_breed',
        entityId: row.id,
        metadata: { species: input.species },
      });
      return toBreed(row);
    });
  }
}

function toBreed(row: BreedRow): AnimalBreed {
  return {
    id: row.id,
    organizationId: row.organizationId,
    species: row.species as AnimalSpecies,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}
