import { OrganizationStatus, Role, type Organization } from '@adoptafacil/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../../shell/api';
import { landingAfterSignIn, needsOrgSetup, portalReadiness } from './portal-readiness';

const base: Organization = { id: 'o1', name: 'Org', createdAt: '', updatedAt: '' };

function client(routes: Record<string, unknown>): ApiClient {
  return {
    request: vi.fn(async (path: string) => {
      if (!(path in routes)) throw new Error(`404 ${path}`);
      return routes[path];
    }),
  } as unknown as ApiClient;
}

describe('portal readiness', () => {
  it('requires the public address and the platform approval', () => {
    const items = portalReadiness(base, OrganizationStatus.Draft);
    expect(items.filter((i) => i.required).map((i) => i.key)).toEqual(['slug', 'review']);
    expect(items.every((i) => !i.done)).toBe(true);
  });

  it('needs setup without slug, or while draft/observed; not while in review or approved', () => {
    const withSlug = { ...base, slug: 'mi-org' };
    expect(needsOrgSetup(base, OrganizationStatus.Approved)).toBe(true);
    expect(needsOrgSetup(withSlug, OrganizationStatus.Draft)).toBe(true);
    expect(needsOrgSetup(withSlug, OrganizationStatus.Observed)).toBe(true);
    expect(needsOrgSetup(withSlug, OrganizationStatus.PendingReview)).toBe(false);
    expect(needsOrgSetup(withSlug, OrganizationStatus.Approved)).toBe(false);
  });

  it('sends an owner of an incomplete organization to "Mi organización"', async () => {
    const c = client({
      '/rbac/my-roles': [Role.Owner],
      '/org/profile': base,
      '/org/status': { status: OrganizationStatus.Draft },
    });
    await expect(landingAfterSignIn(c)).resolves.toBe('/organizacion');
  });

  it('sends a ready organization, a person, or an error to the usual home', async () => {
    await expect(
      landingAfterSignIn(
        client({
          '/rbac/my-roles': [Role.Owner],
          '/org/profile': { ...base, slug: 'mi-org' },
          '/org/status': { status: OrganizationStatus.Approved },
        }),
      ),
    ).resolves.toBe('/');
    await expect(
      landingAfterSignIn(client({ '/rbac/my-roles': [], '/org/profile': base })),
    ).resolves.toBe('/');
    await expect(landingAfterSignIn(client({}))).resolves.toBe('/');
  });
});
