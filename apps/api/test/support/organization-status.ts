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
 * Test fixture helper: sets the organization's formal state directly (as the
 * platform would after approving its RUT and Cámara de Comercio certificate).
 * Functions gated by `CAPABILITY_RULES` (p. ej. vender en la tienda, desde
 * Formalizada) need it. The real transition flow is covered over HTTP in
 * `formalization.integration-spec.ts`.
 */
export async function formalizeTestOrganization(
  admin: PrismaClient,
  organizationId: string,
  formalizationState = 'formalizada',
): Promise<void> {
  await admin.organizationProfile.upsert({
    where: { organizationId },
    update: { formalizationState },
    create: { organizationId, formalizationState },
  });
}
