import { Injectable, Logger } from '@nestjs/common';
import { BRANDED_EMAIL_MONTHLY_LIMIT, planIncludes } from '@adoptafacil/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlansService } from '../../plans/plans.service';
import {
  brandFromPortalTokens,
  brandedFromName,
  safeReplyTo,
  usageMonth,
  type OrgEmailBranding,
  type OrgEmailBrandingPort,
} from './org-email-branding';

/**
 * Decide si un correo de una organización sale con SU marca y lo cuenta contra
 * el tope mensual del plan ({@link BRANDED_EMAIL_MONTHLY_LIMIT}). Lo llama la
 * cola de correos al renderizar, bajo el contexto de la organización (RLS).
 *
 * El conteo es un solo `INSERT … ON CONFLICT DO UPDATE … WHERE count < tope`:
 * atómico aunque varios workers envíen a la vez, así que el tope no se pasa.
 * Cualquier error (base caída, plan ilegible) devuelve `null`: el correo sale
 * igual, con la marca de AdoptaFácil. Nunca bloquea un envío.
 */
@Injectable()
export class OrgEmailBrandingService implements OrgEmailBrandingPort {
  private readonly logger = new Logger('EmailBranding');

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  async claim(organizationId: string, now = new Date()): Promise<OrgEmailBranding | null> {
    try {
      const plan = await this.plans.effectivePlan(organizationId, now);
      if (!planIncludes(plan, 'brandedEmails')) return null;
      const limit = BRANDED_EMAIL_MONTHLY_LIMIT[plan];
      const month = usageMonth(now);

      return await this.prisma.withOrgContext(organizationId, async (tx) => {
        const counted = await tx.$queryRaw<Array<{ branded_count: number }>>`
          INSERT INTO organization_email_usage (organization_id, month, branded_count, updated_at)
          VALUES (${organizationId}::uuid, ${month}, 1, now())
          ON CONFLICT (organization_id, month) DO UPDATE
            SET branded_count = organization_email_usage.branded_count + 1, updated_at = now()
            WHERE organization_email_usage.branded_count < ${limit}
          RETURNING branded_count`;
        if (counted.length === 0 || limit <= 0) return null;

        const [org, profile, theme] = await Promise.all([
          tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
          tx.organizationProfile.findUnique({
            where: { organizationId },
            select: { contactEmail: true },
          }),
          tx.portalTheme.findUnique({ where: { organizationId }, select: { tokens: true } }),
        ]);
        if (!org) return null;
        const replyTo = safeReplyTo(profile?.contactEmail);
        return {
          organizationName: org.name,
          brand: brandFromPortalTokens(theme?.tokens),
          fromName: brandedFromName(org.name),
          ...(replyTo ? { replyTo } : {}),
        };
      });
    } catch (error) {
      this.logger.warn(
        `branding unavailable, sending with AdoptaFácil brand (${(error as Error).message})`,
      );
      return null;
    }
  }
}
