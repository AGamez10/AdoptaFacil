import type { ComponentType } from 'react';
import { ORG_ROLES, Role } from '@adoptafacil/contracts';
import {
  AlertTriangleIcon,
  BoxIcon,
  ChatIcon,
  HeartIcon,
  HomeIcon,
  MegaphoneIcon,
  PawIcon,
  ShieldIcon,
  ShoppingBagIcon,
  UsersIcon,
  type IconProps,
} from '../icons';

/**
 * Role sets that gate the M01/M03 surfaces wired by the shell (T-031). Each set
 * is copied VERBATIM from the `@Roles` of the backend endpoint that feeds the
 * page, so the menu entry and the route guard demand exactly what the API does:
 *   - {@link ANIMAL_VIEW_ROLES}      → GET /animals, /clinical-reminders,
 *                                       /animals/:id/clinical-events (M03).
 *   - {@link ORG_DOCUMENTS_ROLES}    → GET /org/documents (M01, RF03).
 *   - {@link PLATFORM_DOCUMENTS_ROLES} → /platform/documents review (M01, RF03),
 *                                       PLATFORM audience — never an org role.
 */
export const ANIMAL_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.ReadOnlyAuditor,
] as const;

export const ORG_DOCUMENTS_ROLES = [Role.Owner, Role.Administrator, Role.ReadOnlyAuditor] as const;
/** Gestionan/ven a los firmantes de la organización (M13). */
export const ORG_SIGNERS_ROLES = [Role.Owner, Role.Administrator] as const;
/** Firman documentos: el representante legal (Owner) y los firmantes vinculados (auditor). */
export const ORG_SIGNING_ROLES = [Role.Owner, Role.ReadOnlyAuditor] as const;

/**
 * M13 (S-14) — "Dashboard de donaciones y campañas" de la organización. Es
 * la UNIÓN de los tres roles-por-sección del backend
 * (`OrgDonationsDashboardController`'s `@Roles`): cada sección individual
 * (donaciones/campañas/apadrinamientos) puede ser más angosta — el backend
 * decide eso, no este menú.
 */
export const ORG_DONATIONS_DASHBOARD_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.ReadOnlyAuditor,
] as const;

export const PLATFORM_DOCUMENTS_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

/**
 * M01, S-3 — "Organizaciones duplicadas", audiencia de PLATAFORMA. Copiado
 * VERBATIM del `@Roles` de `PlatformDuplicatesController`
 * (`GET /platform/duplicates/queue`) — mismos dos roles que
 * `PLATFORM_DOCUMENTS_ROLES`, declarado aparte porque es el @Roles de un
 * endpoint DISTINTO (mismo criterio que el resto de constantes de este
 * archivo).
 */
export const PLATFORM_DUPLICATES_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

/**
 * F-8 (M11, comunidad) — "Moderación de comunidad", audiencia de PLATAFORMA.
 * Copiado VERBATIM del `@Roles` de `CommunityModerationController`
 * (`GET /platform/community/posts`) — mismos dos roles que
 * `PLATFORM_DOCUMENTS_ROLES`, declarado aparte porque es el @Roles de un
 * endpoint DISTINTO (mismo criterio que el resto de constantes de este
 * archivo: se copia del controller real, no se reutiliza una constante de
 * otro dominio aunque los valores coincidan).
 */
export const COMMUNITY_MODERATION_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

/**
 * M12 (S-7, RF23) — "Moderación de reseñas", audiencia de PLATAFORMA. Copiado
 * VERBATIM del `@Roles` de `PlatformReviewsController`
 * (`GET /platform/reviews/queue`) — mismos dos roles que
 * `PLATFORM_DOCUMENTS_ROLES`, declarado aparte porque es el @Roles de un
 * endpoint DISTINTO (mismo criterio que el resto de constantes de este
 * archivo).
 */
export const PLATFORM_REVIEWS_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

/**
 * Fix (M12/S7-b): el Owner/Administrator ya podía marcar una reseña pública
 * como spam (`POST /reviews/:id/mark-spam`), pero no existía ninguna entrada
 * de menú ni página desde donde ENCONTRARLA primero — "se pueden registrar
 * desde el portal público pero no se pueden ver desde el usuario owner".
 * Copiado VERBATIM del `@Roles` de `GET /reviews/org`.
 */
export const ORG_REVIEWS_ROLES = [Role.Owner, Role.Administrator] as const;

/** RF14 · Libro público · copiado VERBATIM del `@Roles` de `GET /org/ledger`
 *  (registrar y anular exige además Owner/Administrator, en la API y en la UI). */
export const ORG_LEDGER_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.ReadOnlyAuditor,
] as const;

/** Custodia y guardería · copiado VERBATIM del `@Roles` de las lecturas de
 *  `CustodyController` (`GET /custody/...`). Escribir y decidir exige roles
 *  más angostos, en la API y en la UI. */
export const CUSTODY_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.ReadOnlyAuditor,
] as const;

/** Planes y suscripciones · copiado VERBATIM del `@Roles` de `GET /org/plan`:
 *  el plan y su cobro son asunto del Owner/Administrator. */
export const ORG_PLAN_ROLES = [Role.Owner, Role.Administrator] as const;

/** Equipo de la organización: `@Roles` de MembersController e InvitationsController. */
export const ORG_MEMBERS_ROLES = [Role.Owner, Role.Administrator] as const;

/**
 * M13 (S-8, RF24) — "Dashboard de plataforma" (conteos de colas), audiencia
 * de PLATAFORMA. Copiado VERBATIM del `@Roles` de
 * `PlatformDashboardController.getAdminSummary` (`GET /platform/dashboard/admin`)
 * — mismos dos roles que `PLATFORM_DOCUMENTS_ROLES`, declarado aparte por el
 * mismo criterio del resto de constantes de este archivo.
 */
/**
 * F19 — espacio de trabajo del equipo de plataforma (`/plataforma/equipo`).
 * Copiado del `@Roles` de `WorkspaceController` (`/platform/workspace/*`).
 */
export const PLATFORM_TEAM_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

/** Planes de organizaciones · copiado VERBATIM del `@Roles` de
 *  `PlatformPlansController` (`GET`/`PUT /platform/organizations/:id/plan`). */
export const PLATFORM_PLANS_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

/** Café de AdoptaFácil · copiado VERBATIM del `@Roles` de
 *  `PlatformCoffeeController` (`/platform/coffee/*`). */
export const PLATFORM_COFFEE_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

export const PLATFORM_ADMIN_DASHBOARD_ROLES = [
  Role.PlatformAdmin,
  Role.PlatformSuperAdmin,
] as const;

/**
 * M13 (S-8, RF24) — "Dashboard financiero" (finanzas agregadas + mapa/lista
 * geográfica), audiencia de PLATAFORMA — SOLO PlatformSuperAdmin. Copiado
 * VERBATIM del `@Roles` de `PlatformDashboardController.getSuperAdminSummary`
 * (`GET /platform/dashboard/super-admin`). Un PlatformAdmin normal NO debe
 * ver cifras financieras agregadas.
 */
export const PLATFORM_SUPER_ADMIN_DASHBOARD_ROLES = [Role.PlatformSuperAdmin] as const;

/**
 * S2-01 — reconnects "Campañas" as the INTERNAL management surface at
 * `/organizacion/campanas` (CampaignsPage), not the public portal T-065 pulled it
 * from. Copied VERBATIM from `CampaignsController`'s VIEW_ROLES (GET /campaigns):
 * Owner/Administrator/Operator manage; ReadOnlyAuditor views only (no "Coordinator"
 * role exists in this codebase, despite earlier task notes assuming one).
 */
export const CAMPAIGNS_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.ReadOnlyAuditor,
] as const;

/**
 * S2-03 — gestión interna de apadrinamientos recibidos en
 * `/organizacion/apadrinamientos` (SponsorshipsPage). Copiado VERBATIM de
 * `SponsorshipsController`'s `VIEW_ROLES` (`GET /sponsorships`): a diferencia
 * de {@link CAMPAIGNS_VIEW_ROLES}, aquí NO hay Operator — solo
 * Owner/Administrator gestionan y ven, + ReadOnlyAuditor solo ve. Hallazgo
 * documentado en el reporte de cierre de S2-03 (el spec original asumía
 * Operator también).
 */
export const SPONSORSHIP_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.ReadOnlyAuditor,
] as const;

/**
 * S-6 (M08, RF18/RF19) — gestión interna de voluntariado en
 * `/organizacion/voluntariado` (VolunteerOpportunitiesPage). Copiado VERBATIM
 * de `VolunteerOpportunitiesController`'s `VIEW_ROLES` — sin Operator (su
 * alcance no está definido por el documento base para este módulo, mismo
 * criterio que Apadrinamientos), + ReadOnlyAuditor solo ve.
 */
export const VOLUNTEERING_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.ReadOnlyAuditor,
] as const;

/**
 * F-NAV-ADOPCIONES (AUD-F1 finding): "Adopciones" had NO role gate at all —
 * any authenticated user, including a Persona with no org, saw the entry and
 * landed on the org's evaluation kanban (empty, meaningless to them). Copied
 * VERBATIM from `AdoptionsController`'s `EVAL_ROLES` (`GET /adoptions`,
 * `adoptions.controller.ts:18`) — Owner/Administrator/Operator only, no
 * ReadOnlyAuditor (unlike CAMPAIGNS_VIEW_ROLES, the backend here is
 * write-side evaluation, not a view-only audience).
 *
 * Containment only: this hides the entry from a Persona. The Persona-facing
 * "mis solicitudes" view is F1-01, blocked on a backend endpoint that doesn't
 * exist yet — out of scope here.
 */
export const ADOPTIONS_MANAGEMENT_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * F-DONACIONES-RECIBIDAS: "Donaciones recibidas" (gestión de org, la contraparte
 * de "Mis donaciones" del donante). Copiado VERBATIM de `MANAGE_ROLES` en
 * `donations.controller.ts` (`GET /donations/received`) — mismo trío que
 * `ADOPTIONS_MANAGEMENT_ROLES` (Owner/Administrador/Operador), sin
 * ReadOnlyAuditor (el backend no lo incluye para esta ruta).
 */
export const DONATIONS_MANAGEMENT_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * F-6 (M09, banco de recursos) — "Necesidades recibidas" (gestión de org).
 * Copiado VERBATIM de `RESOURCE_VIEW_ROLES` en `resource-needs.controller.ts`
 * (`GET /resources/needs`): Owner/Administrator/Operator gestionan;
 * ReadOnlyAuditor solo ve — mismo trío que `CAMPAIGNS_VIEW_ROLES`.
 */
export const RESOURCE_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.ReadOnlyAuditor,
] as const;

/** Tomar ofrecimientos abiertos: los roles que publican necesidades
 *  (`RESOURCE_WRITE_ROLES` del backend), sin el auditor de solo lectura. */
export const RESOURCE_MANAGE_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * F-7 (M10, marketplace simplificado) — "Marketplace" (gestión de org).
 * Copiado VERBATIM de `MARKETPLACE_VIEW_ROLES` en
 * `marketplace-products.controller.ts` (`GET /marketplace/products`):
 * Owner/Administrator/Operator gestionan; ReadOnlyAuditor solo ve — mismo
 * trío que `CAMPAIGNS_VIEW_ROLES`/`RESOURCE_VIEW_ROLES`.
 */
export const MARKETPLACE_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.ReadOnlyAuditor,
] as const;

/**
 * "Mi organización" / "Personalización" / "Transparencia" (T-062, fix §13 UX
 * gap): these back onto GET endpoints with NO `@Roles` decorator at all (only
 * `@UseGuards(JwtAuthGuard)` — e.g. `GET /org/profile`, `GET /portals/theme`,
 * `GET /org/formalization`), because the backend scopes them by TENANT (RLS),
 * not by role — "any authenticated member" there really means "no additional
 * backend restriction beyond auth". A Persona has no row in `ORG_ROLES` at all
 * (they only have their own personal tenant), so gating the NAV/ROUTE with the
 * canonical `ORG_ROLES` (§13, `@adoptafacil/contracts`) is what actually
 * excludes a Persona while still admitting every real org role — Owner/
 * Administrator/Operator/Volunteer/TemporaryCollaborator/Veterinarian/
 * ReadOnlyAuditor. Narrower write actions (e.g. editing the theme) stay
 * Owner/Administrator-only, enforced separately by the backend PUT and by
 * PortalThemePage itself — this gate is about VIEW/ENTRY, not editing.
 */
export const ORG_MEMBER_ROLES = ORG_ROLES;

/** "Mi trabajo" (tareas, animales a cargo y cuidados) · copiado VERBATIM del
 *  `@Roles` de `MyTeamWorkController` (`GET /team/me/work`): todo el equipo
 *  operativo, sin el auditor de solo lectura. */
export const TEAM_WORK_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.Volunteer,
  Role.TemporaryCollaborator,
] as const;

/**
 * Primary portal sections shown in the sidebar (§M14 portales).
 *
 * This is the single source of truth for the navigation: the sidebar renders it
 * and the router (see router/routes.tsx) maps each `path` to a page. A section
 * whose real screen doesn't exist yet is simply NOT listed here (T-065,
 * pre-demo) rather than pointing at a placeholder — module owners add the
 * entry once the real route exists.
 */
export interface NavItem {
  /** Route path; also the NavLink target. */
  path: string;
  /** Visible label (es-CO). */
  label: string;
  /** Decorative section icon. */
  icon: ComponentType<IconProps>;
  /** Match the path exactly (used for the index route "/"). */
  end?: boolean;
  /**
   * Roles that may see this entry (deny-by-default). Omitted → visible to every
   * authenticated user. When present, the sidebar hides the entry unless the
   * session `hasAnyRole(...roles)` — the FIRST barrier of the double-barrier UX;
   * the route's <RequireRoles> is the second.
   */
  roles?: readonly Role[];
  /**
   * Firmantes vinculados (auditor con cargo de firma): `signing-inbox` solo lo
   * ve quien firma (Owner o auditor con cargo); `not-for-signers` se oculta a
   * quien solo entró a firmar, porque la API le limita la lista a sus
   * documentos y el menú no debe ofrecerle lo que no va a poder usar.
   */
  signerGate?: 'signing-inbox' | 'not-for-signers';
  /**
   * F1-01: restricts the entry to a Persona account (`session.user.accountType
   * === 'person'`), the INVERSE of `roles` — an org account has at least one
   * `ORG_ROLES` entry and a Persona has none, so `roles` (an allow-list of "has
   * ANY of these") can't express "has none of these." Needed because the
   * backend for this entry's route has no role gate at all (any authenticated
   * user), unlike every other `personaOnly` candidate scenario — "Donaciones"
   * stays ungated for both account kinds on purpose (an org's own donation
   * history is legitimately empty, not hidden); "Mis solicitudes" must not
   * show an org account someone else's UX at all.
   */
  personaOnly?: boolean;
  /**
   * Fase 12 (REFACTOR-VISUAL v2): marks an entry whose screen is a
   * `ComingSoon` placeholder (no backend yet) — the sidebar shows a "Pronto"
   * badge next to the label instead of hiding the entry outright.
   */
  comingSoon?: boolean;
  /**
   * MENU-SUBMENUS: when present, this entry renders as a collapsible group —
   * `children` are the real, independently-gated leaves (each keeps its own
   * `roles`/`personaOnly`/`comingSoon`, filtered exactly like a top-level
   * `NavItem` always was). Grouping is PURELY visual: a child's visibility
   * and destination are unchanged from before this entry existed as a group.
   */
  children?: NavItem[];
  /**
   * MENU-SUBMENUS: only meaningful on a group (`children` present). `true`
   * ("Documentos") means the label itself is a real link to `path`, with a
   * separate chevron control just for expand/collapse — clicking the chevron
   * never navigates, clicking the label never toggles. Omitted/`false`
   * ("Donaciones", "Apadrinamientos") means the whole row is a pure
   * expand/collapse toggle and `path` is only a stable React key, never a
   * link target (the parent has no page of its own to go to).
   */
  navigable?: boolean;
  /**
   * Rutas EXTRA que también marcan esta entrada como activa (p. ej. la bandeja de
   * recordatorios cuenta como parte de "Inicio"). Solo visual: no cambia roles ni
   * destino.
   */
  alsoActiveFor?: readonly string[];
}

/**
 * NAV-SECCIONES — cada entrada del menú se declara UNA vez aquí (ruta, etiqueta,
 * ícono y gate de roles). Los dos árboles de abajo solo las ordenan: agrupar
 * nunca cambia quién ve qué ni a dónde lleva (el gate de la ruta sigue siendo la
 * segunda barrera).
 */
const leaf = {
  inicio: {
    path: '/inicio',
    label: 'Inicio',
    icon: HomeIcon,
    end: true,
    alsoActiveFor: ['/recordatorios'],
  },
  // Documentos de la organización (M01, RF03) con sus pantallas hermanas.
  documentos: {
    path: '/organizacion/documentos',
    label: 'Documentos',
    icon: ShieldIcon,
    roles: ORG_DOCUMENTS_ROLES,
    navigable: true,
    children: [
      {
        path: '/organizacion/transparencia-nacional',
        label: 'Transparencia nacional',
        icon: ShieldIcon,
        roles: ORG_MEMBER_ROLES,
      },
      {
        path: '/organizacion/reportes',
        label: 'Reportes',
        icon: ShieldIcon,
        roles: ORG_DOCUMENTS_ROLES,
        signerGate: 'not-for-signers',
      },
      {
        path: '/organizacion/contabilidad',
        label: 'Contabilidad',
        icon: ShieldIcon,
        roles: ORG_DOCUMENTS_ROLES,
        signerGate: 'not-for-signers',
      },
      {
        path: '/organizacion/documentos-por-firmar',
        label: 'Documentos por firmar',
        icon: ShieldIcon,
        roles: ORG_SIGNING_ROLES,
        signerGate: 'signing-inbox',
      },
      {
        path: '/organizacion/firmantes',
        label: 'Firmantes',
        icon: ShieldIcon,
        roles: ORG_SIGNERS_ROLES,
      },
    ],
  },
  usoDeMisDatos: { path: '/uso-de-mis-datos', label: 'Uso de mis datos', icon: ShieldIcon },
  misDonaciones: { path: '/mis-donaciones', label: 'Mis donaciones', icon: HeartIcon },
  donacionesRecibidas: {
    path: '/donaciones-recibidas',
    label: 'Donaciones recibidas',
    icon: HeartIcon,
    roles: DONATIONS_MANAGEMENT_ROLES,
  },
  animales: { path: '/animales', label: 'Animales', icon: PawIcon, roles: ANIMAL_VIEW_ROLES },
  miTrabajo: {
    path: '/mi-trabajo',
    label: 'Mi trabajo',
    icon: UsersIcon,
    roles: TEAM_WORK_ROLES,
  },
  reportesAnimales: {
    path: '/reportes-animales',
    label: 'Reportes de animales',
    icon: PawIcon,
    roles: CUSTODY_VIEW_ROLES,
  },
  custodia: {
    path: '/organizacion/custodia',
    label: 'Custodia y guardería',
    icon: ShieldIcon,
    roles: CUSTODY_VIEW_ROLES,
  },
  adopciones: {
    path: '/adopciones',
    label: 'Adopciones',
    icon: PawIcon,
    roles: ADOPTIONS_MANAGEMENT_ROLES,
  },
  misSolicitudes: {
    path: '/mis-solicitudes',
    label: 'Mis solicitudes',
    icon: PawIcon,
    personaOnly: true,
  },
  misSeguimientos: {
    path: '/mis-seguimientos',
    label: 'Mis seguimientos',
    icon: PawIcon,
    personaOnly: true,
  },
  misAnimales: { path: '/mis-animales', label: 'Mis animales', icon: PawIcon, personaOnly: true },
  misApadrinamientos: { path: '/apadrinar', label: 'Mis apadrinamientos', icon: HeartIcon },
  apadrinamientosRecibidos: {
    path: '/organizacion/apadrinamientos',
    label: 'Apadrinamientos recibidos',
    icon: HeartIcon,
    roles: SPONSORSHIP_VIEW_ROLES,
  },
  anuncios: {
    path: '/organizacion/anuncios',
    label: 'Anuncios urgentes',
    icon: AlertTriangleIcon,
    roles: ORG_PLAN_ROLES,
  },
  miembros: {
    path: '/organizacion/miembros',
    label: 'Miembros del equipo',
    icon: UsersIcon,
    roles: ORG_MEMBERS_ROLES,
  },
  plan: { path: '/organizacion/plan', label: 'Plan', icon: BoxIcon, roles: ORG_PLAN_ROLES },
  miVoluntariado: { path: '/voluntariado', label: 'Mi voluntariado', icon: HeartIcon },
  gestionVoluntariado: {
    path: '/organizacion/voluntariado',
    label: 'Gestión de voluntariado',
    icon: HeartIcon,
    roles: VOLUNTEERING_VIEW_ROLES,
  },
  misOfertas: { path: '/mis-ofertas', label: 'Mis ofertas', icon: BoxIcon },
  necesidades: {
    path: '/organizacion/recursos',
    label: 'Necesidades recibidas',
    icon: BoxIcon,
    roles: RESOURCE_VIEW_ROLES,
  },
  ofrecimientos: {
    path: '/organizacion/recursos/ofrecimientos',
    label: 'Ofrecimientos de la comunidad',
    icon: BoxIcon,
    roles: RESOURCE_MANAGE_ROLES,
  },
  feed: { path: '/comunidad', label: 'Feed', icon: ChatIcon },
  misPublicaciones: { path: '/mis-publicaciones', label: 'Mis publicaciones', icon: ChatIcon },
  misMascotas: { path: '/mis-mascotas', label: 'Mis mascotas', icon: PawIcon },
  miNegocio: { path: '/mi-negocio', label: 'Mi negocio', icon: ShoppingBagIcon },
  campanas: {
    path: '/organizacion/campanas',
    label: 'Campañas',
    icon: MegaphoneIcon,
    roles: CAMPAIGNS_VIEW_ROLES,
  },
  marketplace: {
    path: '/organizacion/marketplace',
    label: 'Marketplace',
    icon: ShoppingBagIcon,
    roles: MARKETPLACE_VIEW_ROLES,
  },
  libroPublico: {
    path: '/organizacion/libro-publico',
    label: 'Libro público',
    icon: ShieldIcon,
    roles: ORG_LEDGER_ROLES,
  },
  resenasPortal: {
    path: '/organizacion/resenas',
    label: 'Reseñas del portal',
    icon: ChatIcon,
    roles: ORG_REVIEWS_ROLES,
  },
  misResenas: { path: '/resenas', label: 'Mis reseñas', icon: ChatIcon },
  // Plataforma (PlatformAdmin / PlatformSuperAdmin).
  revisionDocumentos: {
    path: '/plataforma/documentos',
    label: 'Revisión de documentos',
    icon: ShieldIcon,
    roles: PLATFORM_DOCUMENTS_ROLES,
  },
  aprobarOrganizaciones: {
    path: '/plataforma/organizaciones',
    label: 'Aprobar organizaciones',
    icon: ShieldIcon,
    roles: PLATFORM_DUPLICATES_ROLES,
  },
  planesOrganizaciones: {
    path: '/plataforma/planes',
    label: 'Planes de organizaciones',
    icon: ShieldIcon,
    roles: PLATFORM_PLANS_ROLES,
  },
  duplicadas: {
    path: '/plataforma/organizaciones-duplicadas',
    label: 'Organizaciones duplicadas',
    icon: AlertTriangleIcon,
    roles: PLATFORM_DUPLICATES_ROLES,
  },
  moderacionComunidad: {
    path: '/plataforma/comunidad',
    label: 'Moderación de comunidad',
    icon: ChatIcon,
    roles: COMMUNITY_MODERATION_ROLES,
  },
  directorioServicios: {
    path: '/plataforma/servicios',
    label: 'Directorio de servicios',
    icon: ShoppingBagIcon,
    roles: COMMUNITY_MODERATION_ROLES,
  },
  moderacionResenas: {
    path: '/plataforma/resenas',
    label: 'Moderación de reseñas',
    icon: ChatIcon,
    roles: PLATFORM_REVIEWS_ROLES,
  },
  dashboardPlataforma: {
    path: '/plataforma/dashboard',
    label: 'Dashboard de plataforma',
    icon: ShieldIcon,
    roles: PLATFORM_ADMIN_DASHBOARD_ROLES,
  },
  dashboardFinanciero: {
    path: '/plataforma/dashboard/financiero',
    label: 'Dashboard financiero',
    icon: ShieldIcon,
    roles: PLATFORM_SUPER_ADMIN_DASHBOARD_ROLES,
  },
  banner: {
    path: '/plataforma/banner',
    label: 'Banner del portal',
    icon: ShieldIcon,
    roles: PLATFORM_DOCUMENTS_ROLES,
  },
  cafe: {
    path: '/plataforma/cafe',
    label: 'Café de AdoptaFácil',
    icon: ShoppingBagIcon,
    roles: PLATFORM_COFFEE_ROLES,
  },
  equipo: {
    path: '/plataforma/equipo',
    label: 'Equipo y seguridad',
    icon: ShieldIcon,
    roles: PLATFORM_TEAM_ROLES,
  },
  correos: {
    path: '/plataforma/correos',
    label: 'Correos',
    icon: ShieldIcon,
    roles: PLATFORM_DOCUMENTS_ROLES,
  },
} satisfies Record<string, NavItem>;

/**
 * Menú de una PERSONA (donante/adoptante sin cargo en ninguna organización).
 * Es corto y se mantiene plano, con los grupos desplegables de siempre.
 */
export const personaNavItems: NavItem[] = [
  leaf.inicio,
  {
    path: '/mis-donaciones',
    label: 'Donaciones',
    icon: HeartIcon,
    children: [leaf.misDonaciones, leaf.donacionesRecibidas],
  },
  leaf.misSolicitudes,
  leaf.misSeguimientos,
  leaf.misAnimales,
  {
    path: '/apadrinar',
    label: 'Apadrinamientos',
    icon: HeartIcon,
    children: [leaf.misApadrinamientos, leaf.apadrinamientosRecibidos],
  },
  {
    path: '/voluntariado',
    label: 'Voluntariado',
    icon: HeartIcon,
    children: [leaf.miVoluntariado, leaf.gestionVoluntariado],
  },
  {
    path: '/mis-ofertas',
    label: 'Banco de recursos',
    icon: BoxIcon,
    children: [leaf.misOfertas, leaf.necesidades, leaf.ofrecimientos],
  },
  {
    path: '/comunidad',
    label: 'Comunidad',
    icon: ChatIcon,
    children: [leaf.feed, leaf.misPublicaciones, leaf.misMascotas, leaf.miNegocio],
  },
  { ...leaf.misResenas, label: 'Reseñas' },
  leaf.usoDeMisDatos,
];

/**
 * Una sección del menú de trabajo: un título corto y sus entradas. La sección
 * entera se oculta si la sesión no puede ver ninguna de sus entradas.
 */
export interface NavSection {
  /** Clave estable (estado abierto/cerrado guardado en el navegador). */
  id: string;
  /** Título visible; sin título = entradas sueltas arriba del todo (Inicio). */
  label?: string;
  items: NavItem[];
  /** Abierta la primera vez (además de la que contiene la ruta actual). */
  defaultOpen?: boolean;
  /**
   * Lo PERSONAL de quien trabaja en una organización (sus propias donaciones,
   * reseñas, voluntariado…). Va al final y cerrada para no competir con la
   * gestión del refugio; se abre sola si es lo único que la persona puede ver.
   */
  personal?: boolean;
}

/**
 * NAV-SECCIONES — menú de quien trabaja en una organización o en la plataforma.
 * Agrupado por tareas para que un dueño de refugio que entra por primera vez
 * vea cinco títulos en vez de veinte entradas sueltas. Ninguna entrada cambia de
 * ruta ni de roles respecto al menú plano anterior.
 */
export const navSections: NavSection[] = [
  { id: 'inicio', items: [leaf.inicio, leaf.miTrabajo] },
  {
    id: 'animales',
    label: 'Animales y adopciones',
    defaultOpen: true,
    items: [leaf.animales, leaf.adopciones, leaf.reportesAnimales, leaf.custodia, leaf.anuncios],
  },
  {
    id: 'recaudacion',
    label: 'Recaudación',
    items: [
      // Dentro de "Recaudación" basta el nombre corto: lo propio está en "Mi actividad".
      { ...leaf.donacionesRecibidas, label: 'Donaciones' },
      { ...leaf.apadrinamientosRecibidos, label: 'Apadrinamientos' },
      leaf.campanas,
      leaf.marketplace,
      leaf.libroPublico,
    ],
  },
  {
    id: 'comunidad',
    label: 'Comunidad',
    items: [
      { ...leaf.gestionVoluntariado, label: 'Voluntariado' },
      {
        path: '/organizacion/recursos',
        label: 'Banco de recursos',
        icon: BoxIcon,
        children: [leaf.necesidades, leaf.ofrecimientos],
      },
      { ...leaf.feed, label: 'Muro de publicaciones' },
      { ...leaf.resenasPortal, label: 'Reseñas recibidas' },
    ],
  },
  {
    id: 'organizacion',
    label: 'Organización',
    items: [leaf.documentos, leaf.miembros, leaf.plan],
  },
  {
    id: 'plataforma-organizaciones',
    label: 'Organizaciones',
    defaultOpen: true,
    items: [
      leaf.revisionDocumentos,
      leaf.aprobarOrganizaciones,
      leaf.planesOrganizaciones,
      leaf.duplicadas,
    ],
  },
  {
    id: 'plataforma-moderacion',
    label: 'Moderación',
    items: [leaf.moderacionComunidad, leaf.directorioServicios, leaf.moderacionResenas],
  },
  {
    id: 'plataforma',
    label: 'Plataforma',
    items: [
      leaf.dashboardPlataforma,
      leaf.dashboardFinanciero,
      leaf.banner,
      leaf.cafe,
      leaf.equipo,
      leaf.correos,
    ],
  },
  {
    id: 'personal',
    label: 'Mi actividad',
    personal: true,
    items: [
      leaf.misDonaciones,
      leaf.misApadrinamientos,
      leaf.miVoluntariado,
      leaf.misSolicitudes,
      leaf.misSeguimientos,
      leaf.misAnimales,
      leaf.misOfertas,
      leaf.misPublicaciones,
      leaf.misMascotas,
      leaf.miNegocio,
      leaf.misResenas,
      leaf.usoDeMisDatos,
    ],
  },
];

/**
 * Todas las entradas, sin repetir ruta (primero el menú de trabajo, luego el de
 * persona). Lo usa el "mapa del sitio" del asistente de guía.
 */
export const navItems: NavItem[] = (() => {
  const seen = new Set<string>();
  const out: NavItem[] = [];
  for (const item of [...navSections.flatMap((s) => s.items), ...personaNavItems]) {
    if (item.children) {
      out.push(item);
      continue;
    }
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    out.push(item);
  }
  return out;
})();
