import type { PrismaClient } from '@prisma/client';

/**
 * Test fixture helper (R2-1, AF-023): a newly registered organization starts
 * as a `draft` and stays off the public surface until the platform approves
 * it. Tests that exercise the portal or the public catalogs approve their
 * organizations directly, on the SUPERUSER connection (same convention as
 * `completeTestProfile`). The approval flow itself is covered over HTTP in
 * `org-status.integration-spec.ts`.
 */
export async function approveTestOrganization(
  admin: PrismaClient,
  organizationId: string,
): Promise<void> {
  await admin.organization.update({
    where: { id: organizationId },
    data: { status: 'approved', statusChangedAt: new Date() },
  });
}

/**
 * Donations and online collection (owner's decision, 2026-11-07): only a
 * minimally formalized organization (a legal person) may collect. Tests that
 * collect money formalize the organization after approving it.
 */
export async function formalizeTestOrganization(
  admin: PrismaClient,
  organizationId: string,
  state: 'formalizada' | 'informal' = 'formalizada',
): Promise<void> {
  await admin.organizationProfile.upsert({
    where: { organizationId },
    create: { organizationId, formalizationState: state, rteVigente: false },
    update: { formalizationState: state, rteVigente: false },
  });
}
