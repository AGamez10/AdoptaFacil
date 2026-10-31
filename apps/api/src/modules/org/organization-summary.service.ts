import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PUBLIC_ANIMAL_STATUSES,
  DocumentStatus,
  FORMALIZATION_SEQUENCE,
  FormalizationState,
  type OrganizationDashboardSummary,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { classifyDue } from '../animals/reminders.window';
import { DocumentsService } from './documents.service';
import { effectiveStatus } from './verification';

/**
 * % of formalization completed, derived from the state's POSITION in
 * {@link FORMALIZATION_SEQUENCE} (0–100). MUST stay numerically identical to
 * `deriveFormalizationPct` in `apps/web/src/shell/transparency/transparency-context.tsx`
 * (Fabián's file, the backend cannot import it) — same formula, duplicated on
 * purpose (same pattern as `ADOPTION_STATUS_EMAIL_LABELS` mirroring the web's
 * adoption status labels).
 */
function formalizationPercent(state: FormalizationState): number {
  const index = FORMALIZATION_SEQUENCE.indexOf(state);
  if (index < 0 || FORMALIZATION_SEQUENCE.length <= 1) return 0;
  return Math.round((index / (FORMALIZATION_SEQUENCE.length - 1)) * 100);
}

/**
 * Minimal organization summary (S2-08, M13) — 100% read-only aggregation of
 * counts/totals that already exist elsewhere in the app (animals, adoption
 * requests, sponsorships, documents, formalization, donations). No new
 * business logic: every field reuses an already-established definition (see
 * the field-level comments on {@link OrganizationDashboardSummary}). No time series, no
 * analytics, no gross/commission/net breakdown — explicitly out of scope for
 * this slice (`RutaPresentacion_13Ago_20260809.md`).
 */
@Injectable()
export class OrganizationSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly documents: DocumentsService,
    private readonly config: ConfigService<Env>,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  async getSummary(): Promise<OrganizationDashboardSummary> {
    const organizationId = this.requireOrgId();
    const now = new Date();
    const expiringSoonWindowDays =
      this.config.get('DOCUMENTS_EXPIRING_SOON_WINDOW_DAYS', { infer: true }) ?? 30;

    const [aggregates, verification] = await Promise.all([
      this.prisma.withOrgContext(organizationId, (tx) =>
        Promise.all([
          tx.animal.count({
            where: { organizationId, isActive: true, status: { in: [...PUBLIC_ANIMAL_STATUSES] } },
          }),
          tx.adoptionRequest.count({
            where: { organizationId, status: { in: ['new', 'in_review'] } },
          }),
          tx.adoptionRequest.aggregate({
            where: { organizationId, status: 'new' },
            _count: { _all: true },
            _max: { createdAt: true },
          }),
          tx.sponsorship.count({ where: { organizationId, status: 'active' } }),
          tx.organizationDocument.findMany({
            where: { organizationId },
            select: {
              type: true,
              version: true,
              status: true,
              expiresAt: true,
              reviewedAt: true,
              updatedAt: true,
            },
          }),
          tx.donation.findMany({
            where: { organizationId, status: 'approved', conceptKind: 'organization' },
            select: { breakdown: true },
          }),
          tx.organizationProfile.findUnique({
            where: { organizationId },
            select: { formalizationState: true },
          }),
        ]),
      ),
      // Same computation `GET /org/documents/verification` already exposes —
      // reused as-is instead of recomputing it here.
      this.documents.getVerification(),
    ]);
    const [
      animalsActive,
      adoptionRequestsPending,
      adoptionRequestsNewAgg,
      sponsorshipsActive,
      documentRows,
      donationRows,
      formalizationProfile,
    ] = aggregates;

    const adoptionRequestsNew = adoptionRequestsNewAgg._count._all;
    let documentsExpiringSoon = 0;
    let documentsRejected = 0;
    // Campana: el momento más reciente en que apareció cada aviso. Un documento
    // "entra" a por vencer cuando su vencimiento queda dentro de la ventana.
    let expiringSince: Date | null = null;
    let rejectedSince: Date | null = null;
    const later = (a: Date | null, b: Date): Date => (a && a > b ? a : b);
    // Ola 3: solo cuenta la ÚLTIMA versión de cada tipo de documento. Antes un
    // documento rechazado (o por vencer) seguía en los pendientes aunque la
    // organización ya hubiera subido el reemplazo.
    const latestByType = new Map<string, (typeof documentRows)[number]>();
    for (const row of documentRows) {
      const current = latestByType.get(row.type);
      if (!current || row.version > current.version) latestByType.set(row.type, row);
    }
    for (const row of latestByType.values()) {
      const status = effectiveStatus(row.status as DocumentStatus, row.expiresAt, now);
      if (status === DocumentStatus.Rejected) {
        documentsRejected += 1;
        rejectedSince = later(rejectedSince, row.reviewedAt ?? row.updatedAt);
      } else if (
        status === DocumentStatus.Approved &&
        classifyDue(row.expiresAt, now, expiringSoonWindowDays) === 'upcoming' &&
        row.expiresAt
      ) {
        documentsExpiringSoon += 1;
        expiringSince = later(
          expiringSince,
          new Date(row.expiresAt.getTime() - expiringSoonWindowDays * 86_400_000),
        );
      }
    }

    const donationsReceivedTotal = donationRows.reduce((sum, row) => {
      const breakdown = row.breakdown as unknown as { net: number };
      return sum + breakdown.net;
    }, 0);

    const formalizationState =
      (formalizationProfile?.formalizationState as FormalizationState) ??
      FormalizationState.Informal;

    return {
      animalsActive,
      adoptionRequestsPending,
      adoptionRequestsNew,
      sponsorshipsActive,
      documentsExpiringSoon,
      documentsRejected,
      donationsReceivedTotal,
      formalizationLevel: verification.level,
      formalizationPercent: formalizationPercent(formalizationState),
      adoptionRequestsNewSince: adoptionRequestsNewAgg._max.createdAt?.toISOString() ?? null,
      documentsExpiringSoonSince: expiringSince?.toISOString() ?? null,
      documentsRejectedSince: rejectedSince?.toISOString() ?? null,
    };
  }
}
