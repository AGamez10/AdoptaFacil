import 'reflect-metadata';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { invitationRoleCopy, ORG_ROLES, PLATFORM_ROLES, Role } from '@adoptafacil/contracts';
import { ROLES_KEY } from './roles.decorator';

/**
 * Matriz de roles de la API, sacada de los decoradores reales (`@Controller`,
 * `@Get`/`@Post`…, `@UseGuards`, `@Roles`) de TODOS los controladores.
 *
 * 1. Fija la matriz completa en `docs/seguridad/matriz-roles-api.md`: cualquier
 *    cambio de permisos (una ruta nueva, un rol agregado o quitado) hace fallar
 *    esta prueba hasta regenerar el archivo, así el cambio queda visible en el
 *    PR para quien lo revise. Regenerar:
 *      UPDATE_ROLE_MATRIX=1 pnpm --filter @adoptafacil/api test -- role-matrix
 * 2. Comprueba las reglas que ningún cambio puede romper (deny-by-default,
 *    solo lectura, cargos sin acceso a datos, gobierno del equipo, plataforma).
 *
 * Los permisos que dependen de datos (firmante designado, conflicto de interés,
 * último propietario…) los decide cada servicio y los prueban las suites de
 * integración; aquí solo la primera barrera, el rol.
 */

interface RouteEntry {
  method: string;
  path: string;
  /** `null` = la ruta no declara `@Roles`. */
  roles: string[] | null;
  guards: string[];
  handler: string;
}

const SRC = join(__dirname, '..', '..');
const DOC = join(SRC, '..', '..', '..', 'docs', 'seguridad', 'matriz-roles-api.md');

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

const joinPath = (...parts: Array<string | string[] | undefined>): string =>
  '/' +
  parts
    .flatMap((p) => (Array.isArray(p) ? p[0] : p))
    .filter((p): p is string => typeof p === 'string' && p !== '' && p !== '/')
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .join('/');

function collectRoutes(): RouteEntry[] {
  const routes: RouteEntry[] = [];
  for (const file of controllerFiles(SRC).sort()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value !== 'function') continue;
      const controller = value as { prototype: Record<string, unknown>; name: string };
      const base = Reflect.getMetadata(PATH_METADATA, controller) as string | string[] | undefined;
      if (base === undefined) continue;
      const classRoles = Reflect.getMetadata(ROLES_KEY, controller) as string[] | undefined;
      const classGuards = (Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as Array<{
        name: string;
      }>;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        if (path === undefined) continue;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        const roles =
          (Reflect.getMetadata(ROLES_KEY, handler) as string[] | undefined) ?? classRoles;
        const guards = [
          ...classGuards,
          ...((Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as Array<{ name: string }>),
        ].map((g) => g.name);
        routes.push({
          method,
          path: joinPath(base, path),
          roles: roles && roles.length > 0 ? [...roles] : null,
          guards,
          handler: `${relative(SRC, file)} · ${exportName}.${name}`,
        });
      }
    }
  }
  return routes.sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
  );
}

const ROUTES = collectRoutes();
const key = (r: RouteEntry) => `${r.method} ${r.path}`;
const isWrite = (r: RouteEntry) => r.method !== 'GET' && r.method !== 'HEAD';
const authenticated = (r: RouteEntry) =>
  r.guards.includes('JwtAuthGuard') || r.guards.includes('OptionalJwtAuthGuard');
const allows = (role: Role) => (r: RouteEntry) => r.roles?.includes(role) ?? false;
const routesOf = (role: Role) => ROUTES.filter(allows(role)).map(key).sort();

/** Rutas autenticadas SIN `@Roles`: sirven a la propia persona (su cuenta,
 *  sus donaciones, sus solicitudes, su voluntariado, sus publicaciones) o
 *  validan el permiso dentro del servicio. Cada una se revisó a mano; una
 *  ruta nueva sin `@Roles` falla aquí hasta que alguien la revise y la sume. */
const SELF_SERVICE = new Set([
  'GET /adoptions/contracts/:id',
  'GET /adoptions/contracts/:id/pdf',
  'GET /adoptions/contracts/:id/signatures/:signerId/image',
  'GET /adoptions/deliveries/mine',
  'GET /adoptions/deliveries/mine/:id',
  'GET /adoptions/followups/mine',
  'GET /adoptions/mine',
  'GET /auth/me',
  'GET /auth/mfa/status',
  'GET /community/benefits/mine',
  'GET /community/business/benefits',
  'GET /community/business/me',
  'GET /community/business/redemptions',
  'GET /community/pets',
  'GET /community/posts',
  'GET /community/posts/:id',
  'GET /community/posts/:id/comments',
  'GET /community/posts/mine',
  'GET /community/services/mine',
  'GET /donations/:id/certificate',
  'GET /donations/:id/receipt',
  'GET /donations/mine',
  'GET /legal/me',
  'GET /me/consents',
  'GET /me/notifications',
  'GET /me/privacy/data',
  'GET /me/push/config',
  'GET /org/formalization',
  'GET /org/formalization/capabilities',
  'GET /org/formalization/history',
  'GET /org/profile',
  'GET /portals/theme',
  'GET /rbac/my-roles',
  'GET /resources/offers/mine',
  'GET /resources/open-offers/mine',
  'GET /reviews/mine',
  'GET /service-hours/mine',
  'GET /sponsorships/mine',
  'GET /storage/private',
  'GET /volunteer-certificates/:id',
  'GET /volunteer-certificates/:id/pdf',
  'GET /volunteer-certificates/mine',
  'GET /volunteer-enrollments/mine',
  'PATCH /auth/me/profile',
  'PATCH /community/business/benefits/:id',
  'PATCH /community/business/consent',
  'PATCH /community/pets/:id',
  'PATCH /community/posts/:id',
  'PATCH /community/posts/:id/shareable',
  'PATCH /community/services/:id',
  'PATCH /resources/offers/:id/cancel',
  'PATCH /resources/open-offers/:id/withdraw',
  'POST /adoptions',
  'POST /adoptions/contracts/:id/signatures',
  'POST /adoptions/deliveries/:id/confirm',
  'POST /adoptions/followups/:id/photo',
  'POST /adoptions/followups/:id/submit',
  'POST /auth/mfa/enroll',
  'POST /auth/mfa/enroll/confirm',
  'POST /auth/mfa/verify',
  'POST /community/benefits/:id/pass',
  'POST /community/business/activate',
  'POST /community/business/benefits',
  'POST /community/business/redeem',
  'POST /community/pets',
  'POST /community/posts',
  'POST /community/posts/:id/comments',
  'POST /community/posts/:id/like',
  'POST /community/reactions/mine',
  'POST /community/services',
  'POST /community/services/:id/reviews',
  'POST /donations',
  'POST /legal/me/acceptances',
  'POST /legal/me/revocations',
  'POST /me/consents',
  'POST /me/consents/revoke',
  'POST /me/notifications/read',
  'POST /me/privacy/suppression',
  'POST /me/push/subscriptions',
  'POST /me/push/subscriptions/remove',
  'POST /public/organizations/:slug/reviews',
  'POST /resources/offers',
  'POST /resources/offers/:offerId/proofs',
  'POST /resources/open-offers',
  'POST /reviews',
  'POST /service-hours',
  'POST /service-hours/:id/photos',
  'POST /sponsorships',
  'POST /sponsorships/:id/pay',
  'POST /sponsorships/:id/retry-payment',
  'POST /volunteer-enrollments',
  'PUT /community/posts/:id/reaction',
  'PUT /storage/upload',
  'DELETE /community/comments/:id',
  'DELETE /community/pets/:id',
  'DELETE /community/posts/:id',
]);

/** Lo único que escribe un auditor de solo lectura: registrar SU firma de
 *  contador o revisor fiscal (el servicio exige la designación de firmante),
 *  decidir un reporte que le toca firmar (el servicio exige que sea el
 *  firmante vigente de ese cargo) y marcar avisos como leídos. */
const READ_ONLY_AUDITOR_WRITES = [
  'POST /org/legal-representative',
  'POST /org/pending-reads',
  'POST /org/reports/:id/decision',
];

/** Voluntario y colaborador temporal: panel mínimo (decisión del dueño,
 *  2026-11-22). Su trabajo ("Mi trabajo": tareas, ficha básica de los animales
 *  a su cargo y la bitácora de cuidados, que el servicio limita a lo suyo), el
 *  estado de la organización y la vista previa del portal. Nunca datos de
 *  adoptantes ni donantes; su voluntariado (jornadas, horas, certificados) va
 *  por las rutas de "solo lo propio". */
const NO_DATA_ROLE_ROUTES = [
  'GET /org/portal/preview',
  'GET /org/portal/preview/animals',
  'GET /org/portal/preview/campaigns',
  'GET /org/status',
  'GET /team/me/animals/:animalId/care-logs',
  'GET /team/me/permissions',
  'GET /team/me/work',
  'POST /team/me/animals/:animalId/care-logs',
  'POST /team/me/assignments/:id/complete',
];

/** Rutas donde el cargo deja pasar pero el servicio decide algo más fino. Sale
 *  en la columna "Otro acceso" de la matriz. */
const SERVICE_RULES: Record<string, string> = {
  'POST /animals':
    'Vet.: la ficha queda fuera del portal ("no disponible") hasta que alguien con permiso la publique',
  'PATCH /animals/:id':
    'Vet.: sin el permiso expreso «publicar animales» solo cambia el estado a "no disponible"',
  'POST /animals/:id/activate': 'Vet.: solo con el permiso expreso «publicar animales»',
  'POST /animals/:id/deactivate': 'Vet.: solo con el permiso expreso «publicar animales»',
  'POST /custody/charges':
    'Oper.: mensualidad y alimentación por la tarifa del contrato, otros gastos con soporte, sin recargos por mora',
  'GET /team/me/animals/:animalId/care-logs': 'solo animales a cargo de quien pregunta',
  'POST /team/me/animals/:animalId/care-logs': 'solo animales a cargo de quien pregunta',
  'POST /team/me/assignments/:id/complete': 'solo sus propias tareas',
};

/** Lo que el veterinario NO hace por su cargo sin el permiso expreso. */
const VETERINARIAN_NEEDS_GRANT = ['POST /animals/:id/activate', 'POST /animals/:id/deactivate'];

/** Veterinario: animales, historia clínica, recordatorios y avisos. */
const VETERINARIAN_SCOPE =
  /^\/(animals|clinical-reminders|org\/pending-reads|org\/status|org\/portal\/preview|team\/me|team\/animals\/:animalId\/care-logs)(\/|$)/;

/** Gobierno del equipo y de la cuenta de la organización: nadie por debajo de
 *  Administrador entra (invitar, cambiar cargos, retirar, firmantes, plan,
 *  cobros, dominio, perfil, documentos, configuración del portal). */
const TEAM_GOVERNANCE = [
  'DELETE /org/invitations/:invitationId',
  'DELETE /org/members/:userId',
  'DELETE /org/mercadopago/connect',
  'DELETE /org/portal/domain',
  'DELETE /org/signers/:id',
  'DELETE /rbac/roles/:userId/:role',
  'GET /org/invitations',
  'GET /org/members',
  'GET /org/mercadopago/connect',
  'GET /org/plan',
  'GET /org/signers',
  'POST /org/documents',
  'POST /org/invitations',
  'POST /org/plan/cancel',
  'POST /org/plan/checkout',
  'POST /org/signers',
  'POST /rbac/roles',
  'PUT /org/members/:userId/permissions',
  'PUT /org/members/:userId/role',
  'PUT /org/portal/domain',
  'PUT /org/profile',
  'PUT /portals/theme',
];

/** Lo que solo hace quien habla por la organización (propietario /
 *  representante legal). */
const OWNER_ONLY = [
  'DELETE /org/signers/:id',
  'DELETE /rbac/roles/:userId/:role',
  'POST /org/formalization/transitions',
  'POST /org/signers',
  'POST /org/status/submit',
  'PUT /org/reports/policy',
];

function renderDoc(): string {
  const cols: Array<[Role, string]> = [
    [Role.Owner, 'Prop.'],
    [Role.Administrator, 'Admin'],
    [Role.Operator, 'Oper.'],
    [Role.Veterinarian, 'Vet.'],
    [Role.Volunteer, 'Vol.'],
    [Role.TemporaryCollaborator, 'Temp.'],
    [Role.ReadOnlyAuditor, 'Audit.'],
    [Role.PlatformAdmin, 'P.Admin'],
    [Role.PlatformSuperAdmin, 'P.Super'],
  ];
  const access = (r: RouteEntry): string => {
    const rule = SERVICE_RULES[key(r)];
    if (rule) return rule;
    if (r.roles) return '';
    if (authenticated(r)) return 'cualquier cuenta (sin `@Roles`)';
    return 'pública';
  };
  const lines = [
    '# Matriz de roles de la API',
    '',
    '> **Archivo generado** por `apps/api/src/core/rbac/role-matrix.spec.ts` a partir de los',
    '> decoradores reales de los controladores. No se edita a mano: si cambias un permiso, la',
    '> prueba falla hasta regenerarlo con',
    '> `UPDATE_ROLE_MATRIX=1 pnpm --filter @adoptafacil/api test -- role-matrix`,',
    '> y el cambio queda a la vista en el PR.',
    '',
    'Es la primera barrera (el rol). Las reglas que dependen de datos (firmante designado,',
    'último propietario, conflicto de interés, solo lo propio) las aplica cada servicio y las',
    'prueban las suites de integración. El resumen en palabras está en',
    '`docs/seguridad/roles-y-organizaciones.md`, sección 9.',
    '',
    `Rutas: ${ROUTES.length}. Con \`@Roles\`: ${ROUTES.filter((r) => r.roles).length}. ` +
      `Autenticadas sin \`@Roles\` (cada una revisada): ${ROUTES.filter((r) => !r.roles && authenticated(r)).length}. ` +
      `Públicas: ${ROUTES.filter((r) => !r.roles && !authenticated(r)).length}.`,
    '',
    `| Ruta | ${cols.map(([, label]) => label).join(' | ')} | Otro acceso |`,
    `| --- | ${cols.map(() => ':-:').join(' | ')} | --- |`,
    ...ROUTES.map(
      (r) =>
        `| \`${key(r)}\` | ${cols.map(([role]) => (allows(role)(r) ? '✓' : '')).join(' | ')} | ${access(r)} |`,
    ),
    '',
  ];
  return lines.join('\n');
}

describe('matriz de roles de la API', () => {
  it('encuentra todos los controladores y sus rutas', () => {
    expect(ROUTES.length).toBeGreaterThan(400);
    expect(new Set(ROUTES.map(key)).size).toBe(ROUTES.length);
  });

  it('el documento de la matriz está al día con el código', () => {
    const rendered = renderDoc();
    if (process.env.UPDATE_ROLE_MATRIX === '1') writeFileSync(DOC, rendered);
    const committed = existsSync(DOC) ? readFileSync(DOC, 'utf8') : '';
    // Si falla: cambió un permiso. Regenera el archivo (ver arriba) y revisa el diff.
    expect(committed).toBe(rendered);
  });

  it('deny-by-default: toda ruta autenticada declara @Roles o está revisada como "solo lo propio"', () => {
    const unreviewed = ROUTES.filter(
      (r) => authenticated(r) && !r.roles && !SELF_SERVICE.has(key(r)),
    );
    expect(unreviewed.map((r) => `${key(r)} (${r.handler})`)).toEqual([]);
    // Y la lista no guarda rutas que ya no existen o que ya declaran roles.
    const stale = [...SELF_SERVICE].filter(
      (k) => !ROUTES.some((r) => key(r) === k && !r.roles && authenticated(r)),
    );
    expect(stale).toEqual([]);
  });

  it('toda ruta con @Roles pasa por la autenticación y por el guard de roles', () => {
    const broken = ROUTES.filter(
      (r) => r.roles && (!r.guards.includes('JwtAuthGuard') || !r.guards.includes('RolesGuard')),
    );
    expect(broken.map(key)).toEqual([]);
  });

  it('el auditor de solo lectura no crea, edita ni borra (salvo su propia firma y sus avisos)', () => {
    const writes = ROUTES.filter((r) => isWrite(r) && allows(Role.ReadOnlyAuditor)(r)).map(key);
    expect(writes.sort()).toEqual([...READ_ONLY_AUDITOR_WRITES].sort());
  });

  it.each([Role.Volunteer, Role.TemporaryCollaborator])(
    '%s tiene un panel mínimo, sin datos de adoptantes ni donantes (lo que promete su invitación)',
    (role) => {
      expect(routesOf(role)).toEqual([...NO_DATA_ROLE_ROUTES].sort());
      expect(invitationRoleCopy(role).duties.join(' ')).toMatch(
        /no da acceso a datos de adoptantes ni donantes/,
      );
    },
  );

  it('el veterinario solo entra a animales, historia clínica, recordatorios y su trabajo', () => {
    const outside = ROUTES.filter(allows(Role.Veterinarian)).filter(
      (r) => !VETERINARIAN_SCOPE.test(r.path),
    );
    expect(outside.map(key)).toEqual([]);
  });

  it('el veterinario no publica por su cargo: lo decide el servicio con el permiso expreso', () => {
    for (const k of VETERINARIAN_NEEDS_GRANT) {
      expect(SERVICE_RULES[k]).toMatch(/permiso expreso/);
    }
    for (const k of Object.keys(SERVICE_RULES)) {
      expect(ROUTES.some((r) => key(r) === k)).toBe(true);
    }
  });

  it('el gobierno del equipo y de la cuenta es solo de propietario y administrador', () => {
    for (const k of TEAM_GOVERNANCE) {
      const route = ROUTES.find((r) => key(r) === k);
      expect(route).toBeDefined();
      expect([...(route?.roles ?? [])].sort()).toEqual(expect.arrayContaining([Role.Owner]));
      for (const role of route?.roles ?? []) {
        expect([Role.Owner, Role.Administrator]).toContain(role);
      }
    }
  });

  it('lo que solo hace el representante legal lo declara solo el propietario', () => {
    const ownerOnly = ROUTES.filter((r) => r.roles?.length === 1 && r.roles[0] === Role.Owner);
    expect(ownerOnly.map(key).sort()).toEqual([...OWNER_ONLY].sort());
  });

  it('los roles de plataforma solo entran a /platform, y los de organización nunca entran ahí', () => {
    const platform = new Set<string>(PLATFORM_ROLES);
    const org = new Set<string>(ORG_ROLES);
    const leaks = ROUTES.filter((r) => {
      if (!r.roles) return false;
      const onPlatform = r.path.startsWith('/platform');
      return onPlatform
        ? r.roles.some((role) => org.has(role))
        : r.roles.some((role) => platform.has(role));
    });
    expect(leaks.map(key)).toEqual([]);
  });
});
