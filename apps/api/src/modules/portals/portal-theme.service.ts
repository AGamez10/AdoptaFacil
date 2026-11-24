import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_PORTAL_TEMPLATE,
  PLAN_CATALOG,
  PLAN_REQUIRED_CODE,
  PORTAL_TEMPLATE_IDS,
  isPremiumTemplate,
  isTemplateInSeason,
  minimumPlanFor,
  seasonLabel,
  type PlanCapability,
  type PlanRequiredError,
  PORTAL_TEMPLATE_OPTIONS,
  resolveTemplateOptions,
  type PortalLogoPosition,
  type PortalSocialNavPosition,
  type PortalTemplateId,
  type PortalTemplateOptions,
  type PortalTheme,
  type PortalThemeConfig,
  type UpdatePortalThemeInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PlansService } from '../../core/plans/plans.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { parseStorageKey } from '../../core/storage/storage-keys';
import { posterKeyFor } from '../../core/media/video-transcoder';

/**
 * Ola 3: la plantilla elegida viaja DENTRO del JSON `tokens` bajo esta clave
 * reservada, para no necesitar migración ni tocar la función SECURITY DEFINER
 * `organization_portal_theme` (que el PR de aprobación de organizaciones
 * reescribe). Nunca sale hacia afuera como token: se separa al leer.
 * TODO(migración): pasarla a una columna `template` cuando ese PR se fusione.
 */
const TEMPLATE_KEY = '__template';
/** Ajustes de la plantilla, guardados igual que la plantilla (sin migración). */
const OPTIONS_KEY = '__templateOptions';
/** Llave del video de portada (Historias, Documental), guardada igual. */
const VIDEO_KEY = '__coverVideo';
/** Llave de la imagen de portada de ese video (la saca el servidor al comprimirlo). */
const POSTER_KEY = '__coverVideoPoster';
/** Segundo video (Documental) y su portada, guardados igual. */
const VIDEO2_KEY = '__coverVideo2';
const POSTER2_KEY = '__coverVideo2Poster';

/** Solo un video PÚBLICO de la propia organización, en mp4 o webm. */
function assertCoverVideoKey(key: string, organizationId: string): void {
  const parsed = parseStorageKey(key);
  const isVideo = /\.(mp4|webm)$/i.test(key);
  if (!parsed || parsed.visibility !== 'public' || !isVideo) {
    throw new BadRequestException('El video de portada debe ser un archivo mp4 o webm subido.');
  }
  if (parsed.organizationId !== organizationId) {
    throw new ForbiddenException('El video de portada no es de tu organización.');
  }
}

function isTemplate(value: unknown): value is PortalTemplateId {
  return typeof value === 'string' && (PORTAL_TEMPLATE_IDS as readonly string[]).includes(value);
}

/** Separa la plantilla de los tokens de color guardados. */
function splitStored(raw: unknown): {
  tokens: PortalTheme;
  template?: PortalTemplateId;
  options?: unknown;
  coverVideoKey?: string;
  coverVideoPosterKey?: string;
  coverVideo2Key?: string;
  coverVideo2PosterKey?: string;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { tokens: {} };
  const {
    [TEMPLATE_KEY]: template,
    [OPTIONS_KEY]: options,
    [VIDEO_KEY]: coverVideoKey,
    [POSTER_KEY]: coverVideoPosterKey,
    [VIDEO2_KEY]: coverVideo2Key,
    [POSTER2_KEY]: coverVideo2PosterKey,
    ...tokens
  } = raw as Record<string, unknown>;
  return {
    tokens: tokens as PortalTheme,
    ...(isTemplate(template) ? { template } : {}),
    ...(options !== undefined ? { options } : {}),
    ...(typeof coverVideoKey === 'string' ? { coverVideoKey } : {}),
    ...(typeof coverVideoKey === 'string' && typeof coverVideoPosterKey === 'string'
      ? { coverVideoPosterKey }
      : {}),
    ...(typeof coverVideo2Key === 'string' ? { coverVideo2Key } : {}),
    ...(typeof coverVideo2Key === 'string' && typeof coverVideo2PosterKey === 'string'
      ? { coverVideo2PosterKey }
      : {}),
  };
}

/** Rechaza cualquier ajuste que la plantilla no declare (deny-by-default). */
function assertOptions(template: PortalTemplateId, options: PortalTemplateOptions): void {
  const defs = PORTAL_TEMPLATE_OPTIONS[template];
  for (const [key, value] of Object.entries(options)) {
    const def = defs.find((d) => d.key === key);
    const valid =
      def &&
      (def.kind === 'toggle'
        ? typeof value === 'boolean'
        : typeof value === 'string' && def.choices.some((c) => c.value === value));
    if (!valid) {
      throw new BadRequestException(`Ajuste no válido para la plantilla ${template}: ${key}`);
    }
  }
}

/** Respuesta pública/propia: tokens limpios + plantilla + ajustes resueltos
 *  + la URL pública del video de portada (nunca la llave cruda).
 *
 *  Con `premiumAllowed` en false, una plantilla de pago guardada se reemplaza
 *  por la gratuita por defecto (y sus ajustes y el video, que son de ella, no
 *  se aplican); la elección guardada viaja en `lockedTemplate` para la lectura
 *  propia y vuelve sola cuando la organización paga un plan. */
function present(
  stored: ReturnType<typeof splitStored>,
  storage: StoragePort,
  fallback?: PortalTemplateId,
  premiumAllowed = true,
  now: Date = new Date(),
) {
  const chosen = stored.template ?? fallback;
  // Plantilla de temporada fuera de su ventana: se muestra la Clásica (sin
  // importar el plan) y la elección queda guardada para la próxima temporada.
  const outOfSeason = chosen !== undefined && !isTemplateInSeason(chosen, now);
  const locked =
    !outOfSeason && chosen !== undefined && !premiumAllowed && isPremiumTemplate(chosen);
  const hidden = locked || outOfSeason;
  const template = hidden ? DEFAULT_PORTAL_TEMPLATE : chosen;
  return {
    tokens: stored.tokens,
    ...(template
      ? {
          template,
          templateOptions: resolveTemplateOptions(template, hidden ? undefined : stored.options),
        }
      : {}),
    ...(stored.coverVideoKey && !hidden
      ? { coverVideoUrl: storage.resolvePublicUrl(stored.coverVideoKey) }
      : {}),
    ...(stored.coverVideoPosterKey && !hidden
      ? { coverVideoPosterUrl: storage.resolvePublicUrl(stored.coverVideoPosterKey) }
      : {}),
    ...(stored.coverVideo2Key && !hidden
      ? { coverVideo2Url: storage.resolvePublicUrl(stored.coverVideo2Key) }
      : {}),
    ...(stored.coverVideo2PosterKey && !hidden
      ? { coverVideo2PosterUrl: storage.resolvePublicUrl(stored.coverVideo2PosterKey) }
      : {}),
    ...(locked ? { lockedTemplate: chosen } : {}),
    ...(outOfSeason ? { outOfSeasonTemplate: chosen } : {}),
  };
}

/** 403 `PLAN_REQUIRED` al pedir algo del portal que el plan no incluye: una
 *  plantilla de pago o quitar el sello "Hecho con AdoptaFácil". */
function planRequired(capability: PlanCapability, what: string): ForbiddenException {
  const requiredPlan = minimumPlanFor(capability);
  const body: PlanRequiredError = {
    code: PLAN_REQUIRED_CODE,
    capability,
    requiredPlan,
    message: `${what} está disponible desde el plan ${PLAN_CATALOG[requiredPlan].name}.`,
  };
  return new ForbiddenException(body);
}

/**
 * M14 portal theme (T-027). The theme is tenant-scoped: an org reads/edits only
 * its own row (RLS). The PUBLIC read goes through the `organization_portal_theme`
 * SECURITY DEFINER function so a visitor with no tenant context gets the (public)
 * tokens without evading RLS. Token VALIDATION happens at the controller boundary
 * (Zod, see portals.schemas.ts) — only the safe, validated subset ever lands here.
 */
@Injectable()
export class PortalThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly plans: PlansService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** The caller's own theme (empty tokens when none saved yet). */
  async getOwnTheme(): Promise<PortalThemeConfig> {
    const organizationId = this.requireOrgId();
    const premiumAllowed = await this.plans.hasCapability(organizationId, 'portalPremiumDesigns');
    const removeSealAllowed = await this.plans.hasCapability(organizationId, 'portalRemoveSeal');
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.portalTheme.findUnique({ where: { organizationId } });
      const stored = splitStored(row?.tokens);
      return {
        ...present(stored, this.storage, undefined, premiumAllowed),
        premiumDesignsAvailable: premiumAllowed,
        hideSeal: row?.hideSeal ?? false,
        removeSealAvailable: removeSealAllowed,
        logoPosition: (row?.logoPosition as PortalLogoPosition | null) ?? undefined,
        socialNavPosition: (row?.socialNavPosition as PortalSocialNavPosition | null) ?? undefined,
      };
    });
  }

  /** Create/patch the caller's theme (Owner/Administrator). Persists the validated
   *  tokens (+ layout positions, S2-PORTAL) and records an audit event, all in one
   *  RLS-scoped transaction. `logoPosition`/`socialNavPosition` are independent of
   *  `tokens` — omitting one leaves its stored value untouched. */
  async updateTheme(
    actorUserId: string,
    input: UpdatePortalThemeInput,
  ): Promise<PortalThemeConfig> {
    const organizationId = this.requireOrgId();
    const premiumAllowed = await this.plans.hasCapability(organizationId, 'portalPremiumDesigns');
    // Elegir una plantilla de pago exige un plan que la incluya. Conservar la
    // ya guardada (petición sin `template`) no se bloquea: se muestra la
    // gratuita hasta que la organización pague, sin perder su elección.
    if (input.template !== undefined && isPremiumTemplate(input.template) && !premiumAllowed) {
      throw planRequired('portalPremiumDesigns', 'Esta plantilla');
    }
    // Una plantilla de temporada solo se elige dentro de su ventana.
    if (input.template !== undefined && !isTemplateInSeason(input.template)) {
      throw new BadRequestException(
        `Esta plantilla es de temporada y solo se puede usar ${seasonLabel(input.template)}.`,
      );
    }
    // Quitar el sello exige el plan; volver a mostrarlo, nunca.
    const removeSealAllowed = await this.plans.hasCapability(organizationId, 'portalRemoveSeal');
    if (input.hideSeal === true && !removeSealAllowed) {
      throw planRequired('portalRemoveSeal', 'Quitar el sello "Hecho con AdoptaFácil"');
    }

    // Video de portada: omitido se conserva, `null` lo quita. Si el servidor
    // lo comprimió, dejó su imagen de portada al lado (`.poster.webp`).
    const posterOf = async (key: string | null | undefined): Promise<string | undefined> => {
      if (typeof key !== 'string') return undefined;
      assertCoverVideoKey(key, organizationId);
      const poster = posterKeyFor(key);
      return (await this.storage.readObject(poster)) ? poster : undefined;
    };
    const newPosterKey = await posterOf(input.coverVideoKey);
    const newPoster2Key = await posterOf(input.coverVideo2Key);

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      // `tokens` se reemplaza entero; la plantilla guardada se conserva si
      // la petición no trae una nueva.
      const previous = splitStored(
        (await tx.portalTheme.findUnique({ where: { organizationId } }))?.tokens,
      );
      const template = input.template ?? previous.template;
      // Ajustes: los nuevos si llegan; si no, los guardados solo cuando la
      // plantilla no cambió (los de otra plantilla no aplican).
      let options: PortalTemplateOptions | undefined;
      if (input.templateOptions !== undefined) {
        assertOptions(template ?? DEFAULT_PORTAL_TEMPLATE, input.templateOptions);
        options = input.templateOptions;
      } else if (template === previous.template && template) {
        options = resolveTemplateOptions(template, previous.options);
      }
      const coverVideoKey =
        input.coverVideoKey === undefined ? previous.coverVideoKey : input.coverVideoKey;
      const coverVideoPosterKey =
        input.coverVideoKey === undefined ? previous.coverVideoPosterKey : newPosterKey;
      const coverVideo2Key =
        input.coverVideo2Key === undefined ? previous.coverVideo2Key : input.coverVideo2Key;
      const coverVideo2PosterKey =
        input.coverVideo2Key === undefined ? previous.coverVideo2PosterKey : newPoster2Key;
      const tokens = {
        ...input.tokens,
        ...(template ? { [TEMPLATE_KEY]: template } : {}),
        ...(options && Object.keys(options).length > 0 ? { [OPTIONS_KEY]: options } : {}),
        ...(coverVideoKey ? { [VIDEO_KEY]: coverVideoKey } : {}),
        ...(coverVideoKey && coverVideoPosterKey ? { [POSTER_KEY]: coverVideoPosterKey } : {}),
        ...(coverVideo2Key ? { [VIDEO2_KEY]: coverVideo2Key } : {}),
        ...(coverVideo2Key && coverVideo2PosterKey ? { [POSTER2_KEY]: coverVideo2PosterKey } : {}),
      } as unknown as Prisma.InputJsonValue;
      const row = await tx.portalTheme.upsert({
        where: { organizationId },
        create: {
          organizationId,
          tokens,
          ...(input.logoPosition !== undefined ? { logoPosition: input.logoPosition } : {}),
          ...(input.socialNavPosition !== undefined
            ? { socialNavPosition: input.socialNavPosition }
            : {}),
          ...(input.hideSeal !== undefined ? { hideSeal: input.hideSeal } : {}),
        },
        update: {
          tokens,
          ...(input.logoPosition !== undefined ? { logoPosition: input.logoPosition } : {}),
          ...(input.socialNavPosition !== undefined
            ? { socialNavPosition: input.socialNavPosition }
            : {}),
          ...(input.hideSeal !== undefined ? { hideSeal: input.hideSeal } : {}),
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'portal.theme_updated',
        entityType: 'portal_theme',
        entityId: organizationId,
        // Only WHICH tokens/fields changed — never full values (branding is
        // low-risk but we keep the audit metadata minimal and consistent).
        metadata: {
          tokens: Object.keys(input.tokens),
          layout: [
            ...(input.logoPosition !== undefined ? ['logoPosition'] : []),
            ...(input.socialNavPosition !== undefined ? ['socialNavPosition'] : []),
            ...(input.template !== undefined ? ['template'] : []),
            ...(input.templateOptions !== undefined ? ['templateOptions'] : []),
            ...(input.coverVideoKey !== undefined ? ['coverVideo'] : []),
            ...(input.coverVideo2Key !== undefined ? ['coverVideo2'] : []),
            ...(input.hideSeal !== undefined ? ['hideSeal'] : []),
          ],
        },
      });
      const stored = splitStored(row.tokens);
      return {
        ...present(stored, this.storage, undefined, premiumAllowed),
        premiumDesignsAvailable: premiumAllowed,
        hideSeal: row.hideSeal,
        removeSealAvailable: removeSealAllowed,
        logoPosition: (row.logoPosition as PortalLogoPosition | null) ?? undefined,
        socialNavPosition: (row.socialNavPosition as PortalSocialNavPosition | null) ?? undefined,
      };
    });
  }

  /**
   * Public theme by slug. Reads through the `organization_portal_theme` SECURITY
   * DEFINER function (public tokens + layout only, no tenant context needed, RLS
   * not evaded). Returns the defaults when the org has no theme or the slug is
   * unknown — the portal then simply renders the design-system default layout.
   */
  async getPublicBySlug(slug: string): Promise<PortalThemeConfig> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        data: {
          tokens: PortalTheme;
          logoPosition: PortalLogoPosition;
          socialNavPosition: PortalSocialNavPosition;
          hideSeal?: boolean;
        } | null;
      }>
    >(Prisma.sql`SELECT organization_portal_theme(${slug}) AS data`);
    const data = rows[0]?.data;
    const stored = splitStored(data?.tokens);
    const premiumAllowed =
      stored.template && isPremiumTemplate(stored.template)
        ? await this.capabilityForSlug(slug, 'portalPremiumDesigns')
        : true;
    // El sello se oculta solo si la organización lo pidió Y su plan lo incluye.
    const hideSeal =
      data?.hideSeal === true && (await this.capabilityForSlug(slug, 'portalRemoveSeal'));
    const {
      lockedTemplate: _hidden,
      outOfSeasonTemplate: _ended,
      ...shown
    } = present(stored, this.storage, DEFAULT_PORTAL_TEMPLATE, premiumAllowed);
    return {
      ...shown,
      logoPosition: data?.logoPosition ?? 'left',
      socialNavPosition: data?.socialNavPosition ?? 'right',
      hideSeal,
    };
  }

  /** Si el plan de la organización dueña del portal público incluye la
   *  capacidad. Lee el id por la función SECURITY DEFINER `organization_public`
   *  (sin contexto de tenant) y el plan bajo el contexto de ESA organización
   *  (RLS). Slug desconocido: no hay nada que bloquear. */
  private async capabilityForSlug(slug: string, capability: PlanCapability): Promise<boolean> {
    if (!this.plans.enforced) return true;
    const rows = await this.prisma.$queryRaw<Array<{ data: { id?: string } | null }>>(
      Prisma.sql`SELECT organization_public(${slug}) AS data`,
    );
    const organizationId = rows[0]?.data?.id;
    if (!organizationId) return true;
    return this.plans.hasCapability(organizationId, capability);
  }
}
