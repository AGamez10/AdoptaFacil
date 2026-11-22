import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import * as nav from './nav-items';

/**
 * Cada menú y ruta protegida de la web pide EXACTAMENTE los roles que pide la
 * API para la página que alimenta. La matriz de la API la genera (y la
 * mantiene al día) `apps/api/src/core/rbac/role-matrix.spec.ts` en
 * `docs/seguridad/matriz-roles-api.md`: si alguien cambia un `@Roles` en la API
 * sin cambiar el menú (o al revés), esta prueba falla. Así nadie ve un menú
 * que le responde 403, ni queda oculto algo que su cargo sí permite.
 */
const COLUMNS: Role[] = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.Volunteer,
  Role.TemporaryCollaborator,
  Role.ReadOnlyAuditor,
  Role.PlatformAdmin,
  Role.PlatformSuperAdmin,
];

function apiMatrix(): Map<string, Role[]> {
  const doc = readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', 'docs', 'seguridad', 'matriz-roles-api.md'),
    'utf8',
  );
  const matrix = new Map<string, Role[]>();
  for (const line of doc.split('\n')) {
    const match = /^\| `([A-Z]+ [^`]+)` \|(.*)\|$/.exec(line);
    if (!match) continue;
    const cells = match[2].split('|').map((c) => c.trim());
    matrix.set(
      match[1],
      COLUMNS.filter((_, i) => cells[i] === '✓'),
    );
  }
  return matrix;
}

const MATRIX = apiMatrix();

/** Constante del menú → endpoint de la API que alimenta la página. */
const BACKING: Array<[keyof typeof nav, string]> = [
  ['ANIMAL_VIEW_ROLES', 'GET /animals'],
  ['ORG_DOCUMENTS_ROLES', 'GET /org/documents'],
  ['ORG_SIGNERS_ROLES', 'GET /org/signers'],
  ['ORG_SIGNING_ROLES', 'GET /org/reports/pending-signatures'],
  ['ORG_DONATIONS_DASHBOARD_ROLES', 'GET /org/dashboard/donations'],
  ['ORG_REVIEWS_ROLES', 'GET /reviews/org'],
  ['ORG_LEDGER_ROLES', 'GET /org/ledger'],
  ['CUSTODY_VIEW_ROLES', 'GET /custody/contracts'],
  ['ORG_PLAN_ROLES', 'GET /org/plan'],
  ['ORG_MEMBERS_ROLES', 'GET /org/members'],
  ['TEAM_WORK_ROLES', 'GET /team/me/work'],
  ['CAMPAIGNS_VIEW_ROLES', 'GET /campaigns'],
  ['SPONSORSHIP_VIEW_ROLES', 'GET /sponsorships'],
  ['VOLUNTEERING_VIEW_ROLES', 'GET /volunteer-opportunities'],
  ['ADOPTIONS_MANAGEMENT_ROLES', 'GET /adoptions'],
  ['DONATIONS_MANAGEMENT_ROLES', 'GET /donations/received'],
  ['RESOURCE_VIEW_ROLES', 'GET /resources/needs'],
  ['MARKETPLACE_VIEW_ROLES', 'GET /marketplace/products'],
  ['PLATFORM_DOCUMENTS_ROLES', 'GET /platform/documents/queue'],
  ['PLATFORM_DUPLICATES_ROLES', 'GET /platform/duplicates/queue'],
  ['COMMUNITY_MODERATION_ROLES', 'GET /platform/community/posts'],
  ['PLATFORM_REVIEWS_ROLES', 'GET /platform/reviews/queue'],
  ['PLATFORM_TEAM_ROLES', 'GET /platform/workspace/tickets'],
  ['PLATFORM_PLANS_ROLES', 'GET /platform/organizations/:id/plan'],
  ['PLATFORM_COFFEE_ROLES', 'GET /platform/coffee'],
  ['PLATFORM_ADMIN_DASHBOARD_ROLES', 'GET /platform/dashboard/admin'],
  ['PLATFORM_SUPER_ADMIN_DASHBOARD_ROLES', 'GET /platform/dashboard/super-admin'],
];

describe('roles del menú frente a la matriz de la API', () => {
  it('la matriz generada de la API se puede leer', () => {
    expect(MATRIX.size).toBeGreaterThan(400);
  });

  it.each(BACKING)('%s pide los mismos roles que %s', (constant, endpoint) => {
    const api = MATRIX.get(endpoint);
    expect(api, `${endpoint} no está en la matriz de la API`).toBeDefined();
    const ui = [...(nav[constant] as readonly Role[])].sort();
    expect(ui).toEqual([...(api ?? [])].sort());
  });
});
