import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_PORTAL_TEMPLATE,
  PORTAL_TEMPLATE_IDS,
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
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { parseStorageKey } from '../../core/storage/storage-keys';
import { safePortalDesign } from './portals.schemas';

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
/** Llave del video de portada (plantilla Historias), guardada igual. */
const VIDEO_KEY = '__coverVideo';

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
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { tokens: {} };
  const {
    [TEMPLATE_KEY]: template,
    [OPTIONS_KEY]: options,
    [VIDEO_KEY]: coverVideoKey,
    ...tokens
  } = raw as Record<string, unknown>;
  return {
    tokens: tokens as PortalTheme,
    ...(isTemplate(template) ? { template } : {}),
    ...(options !== undefined ? { options } : {}),
    ...(typeof coverVideoKey === 'string' ? { coverVideoKey } : {}),
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
 *  + la URL pública del video de portada (nunca la llave cruda). */
function present(
  stored: ReturnType<typeof splitStored>,
  storage: StoragePort,
  fallback?: PortalTemplateId,
) {
  const template = stored.template ?? fallback;
  return {
    tokens: stored.tokens,
    ...(template
      ? { template, templateOptions: resolveTemplateOptions(template, stored.options) }
      : {}),
    ...(stored.coverVideoKey
      ? { coverVideoUrl: storage.resolvePublicUrl(stored.coverVideoKey) }
      : {}),
  };
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
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.portalTheme.findUnique({ where: { organizationId } });
      const stored = splitStored(row?.tokens);
      return {
        ...present(stored, this.storage),
        logoPosition: (row?.logoPosition as PortalLogoPosition | null) ?? undefined,
        socialNavPosition: (row?.socialNavPosition as PortalSocialNavPosition | null) ?? undefined,
        design: safePortalDesign(row?.design),
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
      // Video de portada: omitido se conserva, `null` lo quita.
      if (typeof input.coverVideoKey === 'string') {
        assertCoverVideoKey(input.coverVideoKey, organizationId);
      }
      const coverVideoKey =
        input.coverVideoKey === undefined ? previous.coverVideoKey : input.coverVideoKey;
      const tokens = {
        ...input.tokens,
        ...(template ? { [TEMPLATE_KEY]: template } : {}),
        ...(options && Object.keys(options).length > 0 ? { [OPTIONS_KEY]: options } : {}),
        ...(coverVideoKey ? { [VIDEO_KEY]: coverVideoKey } : {}),
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
          ...(input.design !== undefined ? { design: input.design } : {}),
        },
        update: {
          tokens,
          ...(input.logoPosition !== undefined ? { logoPosition: input.logoPosition } : {}),
          ...(input.socialNavPosition !== undefined
            ? { socialNavPosition: input.socialNavPosition }
            : {}),
          ...(input.design !== undefined ? { design: input.design } : {}),
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
            ...(input.design !== undefined ? ['design'] : []),
          ],
        },
      });
      const stored = splitStored(row.tokens);
      return {
        ...present(stored, this.storage),
        logoPosition: (row.logoPosition as PortalLogoPosition | null) ?? undefined,
        socialNavPosition: (row.socialNavPosition as PortalSocialNavPosition | null) ?? undefined,
        design: safePortalDesign(row.design),
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
          design?: string;
        } | null;
      }>
    >(Prisma.sql`SELECT organization_portal_theme(${slug}) AS data`);
    const data = rows[0]?.data;
    const stored = splitStored(data?.tokens);
    return {
      ...present(stored, this.storage, DEFAULT_PORTAL_TEMPLATE),
      logoPosition: data?.logoPosition ?? 'left',
      socialNavPosition: data?.socialNavPosition ?? 'right',
      design: safePortalDesign(data?.design),
    };
  }
}
