import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PetProfile as PetProfileRow, Prisma } from '@prisma/client';
import type {
  CreatePetProfileInput,
  PetProfile,
  PetSex,
  PetSpecies,
  UpdatePetProfileInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_PETS = 20;

function toDate(value: string | undefined): Date | undefined {
  return value ? new Date(`${value}T00:00:00Z`) : undefined;
}

/**
 * Comunidad · ficha privada de mascota. Solo cuentas Persona (una
 * organización ya gestiona sus animales en M03). Vive en el tenant personal
 * de su dueña bajo RLS y además se filtra por `ownerUserId`. Nunca se expone
 * en público. La auditoría registra solo ids, nunca el contenido.
 */
@Injectable()
export class CommunityPetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertPerson(actor: RequestUser): void {
    if (actor.accountType !== 'person') {
      throw new ForbiddenException('La ficha de mascota es para cuentas de persona.');
    }
  }

  private toDto(row: PetProfileRow): PetProfile {
    return {
      id: row.id,
      name: row.name,
      species: row.species as PetSpecies,
      breed: row.breed ?? undefined,
      sex: (row.sex as PetSex | null) ?? undefined,
      birthDate: row.birthDate ? row.birthDate.toISOString().slice(0, 10) : undefined,
      sterilized: row.sterilized ?? undefined,
      adoptedFrom: row.adoptedFrom ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(actor: RequestUser): Promise<PetProfile[]> {
    this.assertPerson(actor);
    const rows = await this.prisma.withOrgContext(actor.organizationId, (tx) =>
      tx.petProfile.findMany({
        where: { ownerUserId: actor.id },
        orderBy: { createdAt: 'asc' },
        take: MAX_PETS,
      }),
    );
    return rows.map((r) => this.toDto(r));
  }

  async create(actor: RequestUser, input: CreatePetProfileInput): Promise<PetProfile> {
    this.assertPerson(actor);
    const organizationId = actor.organizationId;
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const count = await tx.petProfile.count({ where: { ownerUserId: actor.id } });
      if (count >= MAX_PETS) {
        throw new ForbiddenException(`Puedes registrar hasta ${MAX_PETS} mascotas.`);
      }
      const row = await tx.petProfile.create({
        data: {
          ...input,
          birthDate: toDate(input.birthDate),
          organizationId,
          ownerUserId: actor.id,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'community_pet_profile.created',
        entityType: 'community_pet_profile',
        entityId: row.id,
      });
      return this.toDto(row);
    });
  }

  private async findOwn(
    tx: Prisma.TransactionClient,
    actor: RequestUser,
    id: string,
  ): Promise<PetProfileRow> {
    const row = await tx.petProfile.findFirst({ where: { id, ownerUserId: actor.id } });
    if (!row) throw new NotFoundException('Pet not found');
    return row;
  }

  async update(actor: RequestUser, id: string, input: UpdatePetProfileInput): Promise<PetProfile> {
    this.assertPerson(actor);
    const organizationId = actor.organizationId;
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.findOwn(tx, actor, id);
      const { birthDate, ...rest } = input;
      const row = await tx.petProfile.update({
        where: { id },
        data: { ...rest, ...(birthDate !== undefined ? { birthDate: toDate(birthDate) } : {}) },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'community_pet_profile.updated',
        entityType: 'community_pet_profile',
        entityId: id,
      });
      return this.toDto(row);
    });
  }

  async remove(actor: RequestUser, id: string): Promise<void> {
    this.assertPerson(actor);
    const organizationId = actor.organizationId;
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      await this.findOwn(tx, actor, id);
      await tx.petProfile.delete({ where: { id } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'community_pet_profile.deleted',
        entityType: 'community_pet_profile',
        entityId: id,
      });
    });
  }
}
