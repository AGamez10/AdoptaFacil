import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EXPORT_MAX_ROWS_PER_SHEET,
  renderDataExportXlsx,
  type DataExportInput,
} from './data-export-xlsx';
import { renderImpactReportPdf, type ImpactReportData } from './impact-report-pdf';
import { resolveReportPeriod } from '../reports/report-period';

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
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.webBaseUrl = String(config.get('WEB_BASE_URL') ?? 'http://localhost:5173').replace(
      /\/$/,
      '',
    );
  }

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

  /**
   * Cifras del reporte de impacto para un período (fechas de Colombia,
   * inclusivas, máximo un año, nunca en el futuro). Todo son conteos y sumas:
   * ninguna consulta devuelve el contacto de una persona al servicio.
   */
  async collectImpact(
    organizationId: string,
    startDate: string,
    endDate: string,
    now = new Date(),
  ): Promise<ImpactReportData> {
    const period = resolveReportPeriod(startDate, endDate, now);
    const range = { gte: period.fromUtc, lt: period.toUtcExclusive };

    const [org, profile] = await this.prisma.withOrgContext(organizationId, (tx) =>
      Promise.all([
        tx.organization.findUniqueOrThrow({
          where: { id: organizationId },
          select: { name: true },
        }),
        tx.organizationProfile.findUnique({
          where: { organizationId },
          select: { slug: true, location: true },
        }),
      ]),
    );

    const [animalsRegistered, adoptionsCompleted, byStatus, care] =
      await this.prisma.withOrgContext(organizationId, (tx) =>
        Promise.all([
          tx.animal.count({ where: { organizationId, createdAt: range } }),
          tx.adoptionContract.count({
            where: { organizationId, status: 'signed', signedAt: range },
          }),
          tx.animal.groupBy({
            by: ['status'],
            where: { organizationId, isActive: true },
            _count: { _all: true },
          }),
          // Una atención = un evento clínico (la última versión de cada `eventId`).
          tx.clinicalEvent.findMany({
            where: {
              organizationId,
              occurredAt: range,
              type: { in: ['vaccine', 'sterilization', 'surgery', 'treatment'] },
            },
            orderBy: [{ eventId: 'asc' }, { version: 'desc' }],
            distinct: ['eventId'],
            select: { type: true },
          }),
        ]),
      );
    const adoptedTotal = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.animal.count({ where: { organizationId, status: 'adopted' } }),
    );

    const donations = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.donation.findMany({
        where: {
          organizationId,
          status: 'approved',
          OR: [{ receipt: { issuedAt: range } }, { receipt: null, updatedAt: range }],
        },
        select: { breakdown: true, donorUserId: true },
      }),
    );
    const accounts = new Set(donations.map((d) => d.donorUserId).filter(Boolean));
    const guests = donations.filter((d) => !d.donorUserId).length;

    const [hours, campaigns] = await this.prisma.withOrgContext(organizationId, (tx) =>
      Promise.all([
        tx.serviceHours.findMany({
          where: { organizationId, status: 'approved', date: range },
          select: { hours: true, volunteerUserId: true },
        }),
        tx.campaign.findMany({
          where: {
            organizationId,
            status: { not: 'cancelled' },
            createdAt: { lt: period.toUtcExclusive },
            deadline: { gte: period.fromUtc },
          },
          orderBy: { raisedAmount: 'desc' },
          take: 50,
          select: {
            title: true,
            category: true,
            status: true,
            goalAmount: true,
            raisedAmount: true,
          },
        }),
      ]),
    );

    const statusCount = (status: string) =>
      byStatus.find((g) => g.status === status)?._count._all ?? 0;
    const careCount = (type: string) => care.filter((e) => e.type === type).length;
    const city = (profile?.location as { city?: string } | null | undefined)?.city?.trim();

    return {
      organization: { name: org.name, ...(city ? { city } : {}) },
      period: { start: period.startDate, end: period.endDate },
      generatedAt: now,
      animalsRegistered,
      adoptionsCompleted,
      donations: {
        count: donations.length,
        netTotal: donations.reduce(
          (sum, d) => sum + ((d.breakdown as DonationBreakdown | null)?.net ?? 0),
          0,
        ),
        donors: accounts.size + guests,
      },
      care: {
        vaccines: careCount('vaccine'),
        sterilizations: careCount('sterilization'),
        surgeries: careCount('surgery'),
        treatments: careCount('treatment'),
      },
      volunteerHours: Math.round(hours.reduce((sum, h) => sum + h.hours, 0) * 100) / 100,
      volunteers: new Set(hours.map((h) => h.volunteerUserId)).size,
      campaigns,
      animalsToday: {
        available: statusCount('available'),
        inProcess: statusCount('in_process'),
        adopted: adoptedTotal,
      },
      ...(profile?.slug
        ? { portalUrl: `${this.webBaseUrl}/o/${encodeURIComponent(profile.slug)}` }
        : {}),
    };
  }

  /** PDF del reporte de impacto, con su descarga en la bitácora. */
  async impactReport(
    organizationId: string,
    actorUserId: string,
    startDate: string,
    endDate: string,
    now = new Date(),
  ): Promise<{ filename: string; data: Buffer }> {
    const data = await this.collectImpact(organizationId, startDate, endDate, now);
    const pdf = await renderImpactReportPdf(data);
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'organization.impact_report_generated',
      entityType: 'organization',
      entityId: organizationId,
      metadata: { periodStart: data.period.start, periodEnd: data.period.end },
    });
    const stamp = `${data.period.start}_${data.period.end}`.replace(/-/g, '');
    return { filename: `adoptafacil-impacto-${stamp}.pdf`, data: pdf };
  }
}
