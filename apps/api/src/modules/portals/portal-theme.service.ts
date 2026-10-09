import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_PORTAL_TEMPLATE,
  PORTAL_TEMPLATE_IDS,
  type PortalLogoPosition,
  type PortalSocialNavPosition,
  type PortalTemplateId,
  type PortalTheme,
  type PortalThemeConfig,
  type UpdatePortalThemeInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';

/**
 * Ola 3: la plantilla elegida viaja DENTRO del JSON `tokens` bajo esta clave
 * reservada, para no necesitar migración ni tocar la función SECURITY DEFINER
 * `organization_portal_theme` (que el PR de aprobación de organizaciones
 * reescribe). Nunca sale hacia afuera como token: se separa al leer.
 * TODO(migración): pasarla a una columna `template` cuando ese PR se fusione.
 */
const TEMPLATE_KEY = '__template';

function isTemplate(value: unknown): value is PortalTemplateId {
  return typeof value === 'string' && (PORTAL_TEMPLATE_IDS as readonly string[]).includes(value);
}

/** Separa la plantilla de los tokens de color guardados. */
function splitStored(raw: unknown): { tokens: PortalTheme; template?: PortalTemplateId } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { tokens: {} };
  const { [TEMPLATE_KEY]: template, ...tokens } = raw as Record<string, unknown>;
  return {
    tokens: tokens as PortalTheme,
    ...(isTemplate(template) ? { template } : {}),
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
        tokens: stored.tokens,
        logoPosition: (row?.logoPosition as PortalLogoPosition | null) ?? undefined,
        socialNavPosition: (row?.socialNavPosition as PortalSocialNavPosition | null) ?? undefined,
        ...(stored.template ? { template: stored.template } : {}),
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
      const template =
        input.template ??
        splitStored((await tx.portalTheme.findUnique({ where: { organizationId } }))?.tokens)
          .template;
      const tokens = {
        ...input.tokens,
        ...(template ? { [TEMPLATE_KEY]: template } : {}),
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
        },
        update: {
          tokens,
          ...(input.logoPosition !== undefined ? { logoPosition: input.logoPosition } : {}),
          ...(input.socialNavPosition !== undefined
            ? { socialNavPosition: input.socialNavPosition }
            : {}),
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
          ],
        },
      });
      const stored = splitStored(row.tokens);
      return {
        tokens: stored.tokens,
        logoPosition: (row.logoPosition as PortalLogoPosition | null) ?? undefined,
        socialNavPosition: (row.socialNavPosition as PortalSocialNavPosition | null) ?? undefined,
        ...(stored.template ? { template: stored.template } : {}),
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
        } | null;
      }>
    >(Prisma.sql`SELECT organization_portal_theme(${slug}) AS data`);
    const data = rows[0]?.data;
    const stored = splitStored(data?.tokens);
    return {
      tokens: stored.tokens,
      logoPosition: data?.logoPosition ?? 'left',
      socialNavPosition: data?.socialNavPosition ?? 'right',
      template: stored.template ?? DEFAULT_PORTAL_TEMPLATE,
    };
  }
}
