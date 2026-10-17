import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type EmailTemplateVersion as VersionRow } from '@prisma/client';
import type {
  CreateEmailTemplateVersionInput,
  EmailEventKey,
  EmailPreview,
  EmailTemplateContent,
  EmailTemplateDetail,
  EmailTemplateSummary,
  EmailTemplateVersion,
} from '@adoptafacil/contracts';
import type { Env } from '../../../config/env.validation';
import { AuditService } from '../../audit/audit.service';
import { loadAuthConfig } from '../../auth/auth.config';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EMAIL_CATALOG, getEmailEvent, type EmailEventDefinition } from './email-catalog';
import {
  buildOneClickUnsubscribeUrl,
  buildUnsubscribeUrl,
  composeEmail,
  hashEmail,
  verifyUnsubscribe,
} from './email-compose';
import { exampleValues, validateContent, type RenderValues } from './email-render';

export const BULK_CATEGORY = 'bulk';

/** Opt-out of one organization's bulk emails only (item 13). */
export function orgCategory(organizationId: string): string {
  return `org:${organizationId}`;
}
const STATE_CACHE_TTL_MS = 30_000;

interface ResolvedState {
  enabled: boolean;
  activeVersion: number | null;
  content: EmailTemplateContent;
}

export interface RenderedEmail extends EmailPreview {
  headers?: Record<string, string>;
}

/**
 * Superadmin-editable email templates (catalog in code, copy in DB).
 *
 * - Versions are append-only (the app role has no UPDATE/DELETE on them); the
 *   active pointer and the on/off switch live in `email_template_settings`.
 * - Every admin change is audited (UTC) with metadata only — never the copy's
 *   text nor any recipient data.
 * - Reads used by the send path are cached for a few seconds per process so a
 *   bulk send doesn't hit the DB once per recipient.
 */
@Injectable()
export class EmailTemplateService {
  private readonly cache = new Map<EmailEventKey, { at: number; state: ResolvedState }>();
  private readonly webBaseUrl: string;
  private readonly apiBaseUrl: string;
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.webBaseUrl = config.get('WEB_BASE_URL', { infer: true }) ?? 'http://localhost:5173';
    this.apiBaseUrl =
      config.get('STORAGE_PUBLIC_BASE_URL', { infer: true }) ?? 'http://localhost:3000';
    this.secret = loadAuthConfig().jwtSecret;
  }

  // --- Send path -----------------------------------------------------------

  /** Copy + on/off state in use for one event (cached briefly). */
  async resolve(def: EmailEventDefinition): Promise<ResolvedState> {
    const hit = this.cache.get(def.event);
    if (hit && Date.now() - hit.at < STATE_CACHE_TTL_MS) return hit.state;
    const setting = await this.prisma.emailTemplateSetting.findUnique({
      where: { eventKey: def.event },
    });
    let content = def.defaults;
    if (setting?.activeVersion) {
      const row = await this.prisma.emailTemplateVersion.findUnique({
        where: { eventKey_version: { eventKey: def.event, version: setting.activeVersion } },
      });
      if (row) content = toContent(row);
    }
    const state: ResolvedState = {
      enabled: def.required ? true : (setting?.enabled ?? true),
      activeVersion: setting?.activeVersion ?? null,
      content,
    };
    this.cache.set(def.event, { at: Date.now(), state });
    return state;
  }

  /** Opted out of all bulk email, or (with `organizationId`) of that org's. */
  async isSuppressed(email: string, organizationId?: string): Promise<boolean> {
    const categories = organizationId
      ? [BULK_CATEGORY, orgCategory(organizationId)]
      : [BULK_CATEGORY];
    const row = await this.prisma.emailSuppression.findFirst({
      where: { emailHash: hashEmail(email), category: { in: categories } },
    });
    return Boolean(row);
  }

  /** Render the email a recipient gets for this event, with the active copy. */
  render(
    def: EmailEventDefinition,
    content: EmailTemplateContent,
    to: string,
    data: RenderValues,
    organizationName?: string,
    organizationId?: string,
  ): RenderedEmail {
    const bulk = def.category === 'bulk';
    const unsubscribeUrl = bulk
      ? buildUnsubscribeUrl(this.webBaseUrl, this.secret, to, organizationId)
      : undefined;
    const email = composeEmail(def, content, data, {
      organizationName,
      webBaseUrl: this.webBaseUrl,
      unsubscribeUrl,
    });
    if (!bulk) return email;
    // RFC 2369 + RFC 8058 one-click: inbox "Darse de baja" buttons POST here.
    return {
      ...email,
      headers: {
        'List-Unsubscribe': `<${buildOneClickUnsubscribeUrl(this.apiBaseUrl, this.secret, to, organizationId)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    };
  }

  // --- Public unsubscribe -------------------------------------------------

  /** Idempotent: a repeated click (or the inbox's one-click POST) is a no-op. */
  async unsubscribe(
    emailHash: string,
    token: string,
    source: 'link' | 'one_click',
    organizationId?: string,
  ): Promise<void> {
    if (!verifyUnsubscribe(this.secret, emailHash, token, organizationId)) {
      throw new BadRequestException('El enlace para darte de baja no es válido.');
    }
    const category = organizationId ? orgCategory(organizationId) : BULK_CATEGORY;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO email_suppressions (email_hash, category, source)
      VALUES (${emailHash}, ${category}, ${source})
      ON CONFLICT (email_hash, category) DO NOTHING
    `);
  }

  // --- Superadmin panel ---------------------------------------------------

  async list(): Promise<EmailTemplateSummary[]> {
    const [settings, latest] = await Promise.all([
      this.prisma.emailTemplateSetting.findMany(),
      this.prisma.emailTemplateVersion.groupBy({ by: ['eventKey'], _max: { version: true } }),
    ]);
    const settingBy = new Map(settings.map((s) => [s.eventKey, s]));
    const latestBy = new Map(latest.map((l) => [l.eventKey, l._max.version ?? null]));
    return EMAIL_CATALOG.map((def) => {
      const setting = settingBy.get(def.event);
      return summary(def, setting, latestBy.get(def.event) ?? null);
    });
  }

  async detail(event: string): Promise<EmailTemplateDetail> {
    const def = this.requireEvent(event);
    const [setting, rows] = await Promise.all([
      this.prisma.emailTemplateSetting.findUnique({ where: { eventKey: def.event } }),
      this.prisma.emailTemplateVersion.findMany({
        where: { eventKey: def.event },
        orderBy: { version: 'desc' },
        take: 50,
      }),
    ]);
    const active = setting?.activeVersion
      ? rows.find((r) => r.version === setting.activeVersion)
      : undefined;
    return {
      ...summary(def, setting, rows[0]?.version ?? null),
      variables: def.variables,
      ctaUrlVariable: def.ctaUrlVariable,
      defaultContent: def.defaults,
      activeContent: active ? toContent(active) : def.defaults,
      versions: rows.map(toVersion),
    };
  }

  async createVersion(
    actorUserId: string,
    event: string,
    input: CreateEmailTemplateVersionInput,
  ): Promise<EmailTemplateDetail> {
    const def = this.requireEvent(event);
    const content = pickContent(input);
    this.assertValid(def, content);
    const organizationId = this.requireOrg();

    // Next version under a per-event advisory lock: two admins saving at the
    // same time get v(n+1) and v(n+2), never a unique-violation 500.
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`email_template:${def.event}`}))`,
      );
      const max = await tx.emailTemplateVersion.aggregate({
        where: { eventKey: def.event },
        _max: { version: true },
      });
      const version = (max._max.version ?? 0) + 1;
      await tx.emailTemplateVersion.create({
        data: {
          eventKey: def.event,
          version,
          ...content,
          ctaLabel: content.ctaLabel ?? null,
          footerNote: content.footerNote ?? null,
          changeNote: input.changeNote?.trim() || null,
          createdByUserId: actorUserId,
        },
      });
      if (input.activate) {
        await tx.emailTemplateSetting.upsert({
          where: { eventKey: def.event },
          create: { eventKey: def.event, activeVersion: version, updatedByUserId: actorUserId },
          update: { activeVersion: version, updatedByUserId: actorUserId },
        });
      }
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'platform.email_template.version_created',
        entityType: 'email_template',
        entityId: def.event,
        metadata: { version, activated: Boolean(input.activate) },
      });
    });
    this.cache.delete(def.event);
    return this.detail(def.event);
  }

  async activate(
    actorUserId: string,
    event: string,
    version: number | null,
  ): Promise<EmailTemplateDetail> {
    const def = this.requireEvent(event);
    const organizationId = this.requireOrg();
    if (version !== null) {
      const exists = await this.prisma.emailTemplateVersion.findUnique({
        where: { eventKey_version: { eventKey: def.event, version } },
      });
      if (!exists) throw new NotFoundException('Esa versión no existe para este correo.');
    }
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const current = await tx.emailTemplateSetting.findUnique({ where: { eventKey: def.event } });
      // Idempotent: re-activating the version already active changes nothing.
      if ((current?.activeVersion ?? null) === version) return;
      await tx.emailTemplateSetting.upsert({
        where: { eventKey: def.event },
        create: { eventKey: def.event, activeVersion: version, updatedByUserId: actorUserId },
        update: { activeVersion: version, updatedByUserId: actorUserId },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'platform.email_template.activated',
        entityType: 'email_template',
        entityId: def.event,
        metadata: { version, previousVersion: current?.activeVersion ?? null },
      });
    });
    this.cache.delete(def.event);
    return this.detail(def.event);
  }

  async setEnabled(
    actorUserId: string,
    event: string,
    enabled: boolean,
  ): Promise<EmailTemplateDetail> {
    const def = this.requireEvent(event);
    if (def.required && !enabled) {
      throw new ForbiddenException(
        'Este correo es obligatorio (seguridad de la cuenta) y no se puede apagar.',
      );
    }
    const organizationId = this.requireOrg();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const current = await tx.emailTemplateSetting.findUnique({ where: { eventKey: def.event } });
      if ((current?.enabled ?? true) === enabled) return; // idempotent
      await tx.emailTemplateSetting.upsert({
        where: { eventKey: def.event },
        create: { eventKey: def.event, enabled, updatedByUserId: actorUserId },
        update: { enabled, updatedByUserId: actorUserId },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: enabled ? 'platform.email_template.enabled' : 'platform.email_template.disabled',
        entityType: 'email_template',
        entityId: def.event,
        metadata: {},
      });
    });
    this.cache.delete(def.event);
    return this.detail(def.event);
  }

  /** Render a draft (or the active copy) with the catalog's example values. */
  async preview(
    event: string,
    content?: EmailTemplateContent,
    organizationName?: string,
  ): Promise<EmailPreview> {
    const def = this.requireEvent(event);
    const copy = content ? pickContent(content) : (await this.resolve(def)).content;
    if (content) this.assertValid(def, copy);
    const org = organizationName?.trim() || 'Fundación Huellitas de Amor';
    const rendered = this.render(
      def,
      copy,
      'vista-previa@adoptafacil.co',
      exampleValues(def.variables),
      org,
    );
    return {
      subject: rendered.subject,
      preheader: rendered.preheader,
      html: rendered.html,
      text: rendered.text,
    };
  }

  requireEvent(event: string): EmailEventDefinition {
    const def = getEmailEvent(event);
    if (!def) throw new NotFoundException('Ese correo no existe en el catálogo.');
    return def;
  }

  private assertValid(def: EmailEventDefinition, content: EmailTemplateContent): void {
    const errors = validateContent(def, content);
    if (errors.length) {
      throw new BadRequestException({ message: 'La plantilla tiene errores.', errors });
    }
  }

  private requireOrg(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) throw new ForbiddenException('Missing tenant context');
    return organizationId;
  }

  /** Test hook: forget cached state (e.g. after direct DB writes in tests). */
  clearCache(): void {
    this.cache.clear();
  }
}

function pickContent(input: EmailTemplateContent): EmailTemplateContent {
  return {
    subject: input.subject,
    preheader: input.preheader ?? '',
    heading: input.heading,
    body: input.body,
    ...(input.ctaLabel?.trim() ? { ctaLabel: input.ctaLabel } : {}),
    ...(input.footerNote?.trim() ? { footerNote: input.footerNote } : {}),
  };
}

function toContent(row: VersionRow): EmailTemplateContent {
  return {
    subject: row.subject,
    preheader: row.preheader,
    heading: row.heading,
    body: row.body,
    ...(row.ctaLabel ? { ctaLabel: row.ctaLabel } : {}),
    ...(row.footerNote ? { footerNote: row.footerNote } : {}),
  };
}

function toVersion(row: VersionRow): EmailTemplateVersion {
  return {
    ...toContent(row),
    version: row.version,
    ...(row.changeNote ? { changeNote: row.changeNote } : {}),
    ...(row.createdByUserId ? { createdByUserId: row.createdByUserId } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

function summary(
  def: EmailEventDefinition,
  setting: { enabled: boolean; activeVersion: number | null; updatedAt: Date } | null | undefined,
  latestVersion: number | null,
): EmailTemplateSummary {
  return {
    event: def.event,
    label: def.label,
    description: def.description,
    audience: def.audience,
    category: def.category,
    theme: def.theme,
    required: def.required,
    enabled: def.required ? true : (setting?.enabled ?? true),
    activeVersion: setting?.activeVersion ?? null,
    latestVersion,
    ...(setting ? { updatedAt: setting.updatedAt.toISOString() } : {}),
  };
}
