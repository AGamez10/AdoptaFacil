import { Injectable } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EXPORT_MAX_ROWS_PER_SHEET,
  renderDataExportXlsx,
  type DataExportInput,
} from './data-export-xlsx';

interface DonationBreakdown {
  net?: number;
  platformFee?: number;
  platformIva?: number;
  gatewayFee?: number;
  gatewayIva?: number;
}

const take = EXPORT_MAX_ROWS_PER_SHEET;

/** `YYYYMMDD` de hoy en Colombia, para el nombre del archivo. */
function colombiaStamp(now: Date): string {
  return new Date(now.getTime() - 5 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Exportaciones de la organización (planes Crece y Pro). La organización sale
 * SIEMPRE del JWT (la pasa el controlador) y cada lectura corre en
 * `withOrgContext` bajo RLS, con el filtro explícito por `organizationId` como
 * defensa en profundidad: la Org A nunca exporta una fila de la Org B.
 *
 * Cada hoja se lee en su propia transacción corta (no una sola transacción
 * larga) y con un tope de filas, para no retener conexiones del pool ni la
 * memoria del servidor con una organización grande.
 */
@Injectable()
export class OrgExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async collectData(organizationId: string, now = new Date()): Promise<DataExportInput> {
    const organization = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    );

    const animals = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.animal.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
        take,
        select: {
          id: true,
          name: true,
          species: true,
          sex: true,
          size: true,
          status: true,
          customBreed: true,
          birthDate: true,
          approximateAgeMonths: true,
          tags: true,
          isActive: true,
          createdAt: true,
          breed: { select: { name: true } },
        },
      }),
    );

    // Sin `applicant` (contacto del adoptante): solo el animal, el estado y las fechas.
    const [requests, contracts] = await this.prisma.withOrgContext(organizationId, (tx) =>
      Promise.all([
        tx.adoptionRequest.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'asc' },
          take,
          select: {
            id: true,
            animalSnapshot: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        tx.adoptionContract.findMany({
          where: { organizationId },
          orderBy: { version: 'asc' },
          select: { requestId: true, status: true, signedAt: true },
        }),
      ]),
    );
    // La versión más reciente del contrato de cada solicitud.
    const contractByRequest = new Map(contracts.map((c) => [c.requestId, c]));

    // Sin `payer` (contacto del donante): solo montos, destino y fechas.
    const donations = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.donation.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
        take,
        select: {
          id: true,
          status: true,
          conceptKind: true,
          conceptId: true,
          amountCharged: true,
          breakdown: true,
          createdAt: true,
          updatedAt: true,
          receipt: { select: { issuedAt: true } },
        },
      }),
    );

    const campaigns = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.campaign.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
        take,
        select: {
          id: true,
          title: true,
          category: true,
          goalAmount: true,
          raisedAmount: true,
          deadline: true,
          status: true,
          createdAt: true,
        },
      }),
    );

    // Voluntariado: cifras por oportunidad, nunca nombres ni correos de voluntarios.
    const [opportunities, accepted, hours] = await this.prisma.withOrgContext(
      organizationId,
      (tx) =>
        Promise.all([
          tx.volunteerOpportunity.findMany({
            where: { organizationId },
            orderBy: { createdAt: 'asc' },
            take,
            select: {
              id: true,
              title: true,
              category: true,
              startDate: true,
              endDate: true,
              capacity: true,
              status: true,
            },
          }),
          tx.volunteerEnrollment.groupBy({
            by: ['opportunityId'],
            where: { organizationId, status: 'accepted' },
            _count: { _all: true },
          }),
          tx.serviceHours.findMany({
            where: { organizationId, status: 'approved' },
            select: { hours: true, enrollment: { select: { opportunityId: true } } },
          }),
        ]),
    );
    const acceptedBy = new Map(accepted.map((g) => [g.opportunityId, g._count._all]));
    const hoursBy = new Map<string, number>();
    for (const h of hours) {
      const key = h.enrollment.opportunityId;
      hoursBy.set(key, (hoursBy.get(key) ?? 0) + h.hours);
    }

    const animalNames = new Map(animals.map((a) => [a.id, a.name]));
    const campaignTitles = new Map(campaigns.map((c) => [c.id, c.title]));

    return {
      organizationName: organization.name,
      generatedAt: now,
      animals: animals.map((a) => ({
        id: a.id,
        name: a.name,
        species: a.species,
        sex: a.sex,
        size: a.size,
        status: a.status,
        breed: a.breed?.name ?? a.customBreed ?? null,
        birthDate: a.birthDate,
        approximateAgeMonths: a.approximateAgeMonths,
        tags: a.tags,
        isActive: a.isActive,
        createdAt: a.createdAt,
      })),
      adoptions: requests.map((r) => {
        const contract = contractByRequest.get(r.id);
        const snapshot = (r.animalSnapshot ?? {}) as { name?: unknown };
        return {
          id: r.id,
          animalName: typeof snapshot.name === 'string' ? snapshot.name : '',
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          contractStatus: contract?.status ?? null,
          contractSignedAt: contract?.signedAt ?? null,
        };
      }),
      donations: donations.map((d) => {
        const b = (d.breakdown ?? {}) as DonationBreakdown;
        const conceptName =
          d.conceptKind === 'animal'
            ? (animalNames.get(d.conceptId) ?? null)
            : d.conceptKind === 'campaign'
              ? (campaignTitles.get(d.conceptId) ?? null)
              : null;
        return {
          id: d.id,
          approvedAt: d.receipt?.issuedAt ?? (d.status === 'pending' ? d.createdAt : d.updatedAt),
          status: d.status,
          conceptKind: d.conceptKind,
          conceptName,
          amountCharged: d.amountCharged,
          net: b.net ?? 0,
          platformFee: b.platformFee ?? 0,
          platformIva: b.platformIva ?? 0,
          gatewayFee: b.gatewayFee ?? 0,
          gatewayIva: b.gatewayIva ?? 0,
        };
      }),
      campaigns,
      opportunities: opportunities.map((o) => ({
        ...o,
        acceptedVolunteers: acceptedBy.get(o.id) ?? 0,
        approvedHours: Math.round((hoursBy.get(o.id) ?? 0) * 100) / 100,
      })),
    };
  }

  /** Arma el Excel y deja la descarga en la bitácora (solo conteos, nunca datos). */
  async exportData(
    organizationId: string,
    actorUserId: string,
    now = new Date(),
  ): Promise<{ filename: string; data: Buffer }> {
    const input = await this.collectData(organizationId, now);
    const data = await renderDataExportXlsx(input);
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'organization.data_exported',
      entityType: 'organization',
      entityId: organizationId,
      metadata: {
        format: 'xlsx',
        animals: input.animals.length,
        adoptions: input.adoptions.length,
        donations: input.donations.length,
        campaigns: input.campaigns.length,
        opportunities: input.opportunities.length,
      },
    });
    return { filename: `adoptafacil-datos-${colombiaStamp(now)}.xlsx`, data };
  }
}
