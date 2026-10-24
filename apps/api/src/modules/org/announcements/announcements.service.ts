import { randomUUID } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ORG_ANNOUNCEMENT_DAILY_LIMIT,
  type AnnouncementAudience,
  type OrgAnnouncementAudience,
  type SendOrgAnnouncementInput,
  type SendOrgAnnouncementResult,
} from '@adoptafacil/contracts';
import { AuditService } from '../../../core/audit/audit.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../../core/notifications/notification.port';
import { hashEmail } from '../../../core/notifications/templates/email-compose';
import {
  BULK_CATEGORY,
  orgCategory,
} from '../../../core/notifications/templates/email-template.service';
import { PrismaService } from '../../../prisma/prisma.service';

/** Upper bound of recipients per announcement (one org's own contacts). */
const MAX_RECIPIENTS = 5000;
const ENQUEUE_BATCH = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
export const ANNOUNCEMENT_AUDIT_ACTION = 'org.announcement_sent';

interface Contact {
  email: string;
  name?: string;
}

/**
 * Urgent announcements of an organization to its OWN contacts (item 13):
 * past donors, adoption applicants and volunteers. Everything is read under
 * the org's RLS context, so only that tenant's contacts are reachable. Bulk
 * category: every email carries an unsubscribe link for THIS organization and
 * nobody who opted out (of the org or of all bulk email) receives it. Audited
 * with counts only, never addresses.
 */
@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
  ) {}

  async audience(organizationId: string, now = new Date()): Promise<OrgAnnouncementAudience> {
    const [byAudience, sentToday] = await Promise.all([
      this.contacts(organizationId),
      this.sentInLastDay(organizationId, now),
    ]);
    const suppressed = await this.suppressedHashes(organizationId, [
      ...new Set(Object.values(byAudience).flatMap((list) => list.map((c) => c.email))),
    ]);
    const reachable = (list: Contact[]) => list.filter((c) => !suppressed.has(hashEmail(c.email)));
    const donors = reachable(byAudience.donors);
    const adopters = reachable(byAudience.adopters);
    const volunteers = reachable(byAudience.volunteers);
    const total = new Set([...donors, ...adopters, ...volunteers].map((c) => key(c.email))).size;
    return {
      donors: donors.length,
      adopters: adopters.length,
      volunteers: volunteers.length,
      total,
      remainingToday: Math.max(0, ORG_ANNOUNCEMENT_DAILY_LIMIT - sentToday),
    };
  }

  async send(
    organizationId: string,
    actorUserId: string,
    input: SendOrgAnnouncementInput,
    now = new Date(),
  ): Promise<SendOrgAnnouncementResult> {
    if ((await this.sentInLastDay(organizationId, now)) >= ORG_ANNOUNCEMENT_DAILY_LIMIT) {
      throw new HttpException(
        {
          code: 'ANNOUNCEMENT_LIMIT',
          message: `Puedes enviar hasta ${ORG_ANNOUNCEMENT_DAILY_LIMIT} anuncios en 24 horas.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const byAudience = await this.contacts(organizationId);
    const recipients = new Map<string, Contact>();
    for (const audience of input.audiences) {
      for (const contact of byAudience[audience]) {
        if (!recipients.has(key(contact.email))) recipients.set(key(contact.email), contact);
      }
    }
    const list = [...recipients.values()].slice(0, MAX_RECIPIENTS);
    const announcementId = randomUUID();
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const orgName = org?.name ?? 'Una organización de AdoptaFácil';

    // Audit first (counts only): the daily limit holds even if enqueuing fails midway.
    await this.audit.record({
      organizationId,
      actorUserId,
      action: ANNOUNCEMENT_AUDIT_ACTION,
      entityType: 'announcement',
      entityId: announcementId,
      metadata: { audiences: input.audiences, recipients: list.length },
    });

    for (let i = 0; i < list.length; i += ENQUEUE_BATCH) {
      await Promise.all(
        list.slice(i, i + ENQUEUE_BATCH).map(async ({ email, name }) => {
          try {
            await this.notifications.send({
              to: email,
              subject: `Urgente: ${input.title}`,
              body: `${orgName}: ${input.message}`,
              idempotencyKey: `org.urgent_announcement:${announcementId}:${key(email)}`,
              template: {
                event: 'org.urgent_announcement',
                organizationName: orgName,
                organizationId,
                data: {
                  organizacion: orgName,
                  nombre: firstName(name) ?? 'amigo(a)',
                  titulo: input.title,
                  mensaje: input.message,
                },
              },
            });
          } catch (error) {
            // Never the address in the log (Ley 1581).
            this.logger.warn(
              `No se pudo encolar el anuncio ${announcementId}: ${(error as Error).message}`,
            );
          }
        }),
      );
    }
    return { recipients: list.length };
  }

  /** Distinct contacts per audience, read under the org's RLS context. */
  private async contacts(organizationId: string): Promise<Record<AnnouncementAudience, Contact[]>> {
    const [donations, requests, enrollments] = await this.prisma.withOrgContext(
      organizationId,
      (tx) =>
        Promise.all([
          tx.donation.findMany({
            where: { organizationId, status: 'approved' },
            select: { payer: true },
            take: MAX_RECIPIENTS * 2,
          }),
          tx.adoptionRequest.findMany({
            where: { organizationId },
            select: { applicant: true },
            take: MAX_RECIPIENTS * 2,
          }),
          tx.volunteerEnrollment.findMany({
            where: { organizationId, status: { not: 'rejected' } },
            select: { volunteerEmail: true, volunteerName: true },
            take: MAX_RECIPIENTS * 2,
          }),
        ]),
    );
    const fromJson = (value: unknown, nameKey: string): Contact | null => {
      const obj = value as Record<string, unknown> | null;
      const email = typeof obj?.email === 'string' ? obj.email.trim() : '';
      const name = typeof obj?.[nameKey] === 'string' ? (obj[nameKey] as string).trim() : undefined;
      return isEmail(email) ? { email, name } : null;
    };
    return {
      donors: unique(donations.map((d) => fromJson(d.payer, 'fullName'))),
      adopters: unique(requests.map((r) => fromJson(r.applicant, 'fullName'))),
      volunteers: unique(
        enrollments.map((e) =>
          isEmail(e.volunteerEmail.trim())
            ? { email: e.volunteerEmail.trim(), name: e.volunteerName }
            : null,
        ),
      ),
    };
  }

  private async suppressedHashes(organizationId: string, emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();
    const rows = await this.prisma.emailSuppression.findMany({
      where: {
        emailHash: { in: emails.map(hashEmail) },
        category: { in: [BULK_CATEGORY, orgCategory(organizationId)] },
      },
      select: { emailHash: true },
    });
    return new Set(rows.map((r) => r.emailHash));
  }

  private async sentInLastDay(organizationId: string, now: Date): Promise<number> {
    return this.prisma.withOrgContext(organizationId, (tx) =>
      tx.auditLog.count({
        where: {
          organizationId,
          action: ANNOUNCEMENT_AUDIT_ACTION,
          createdAt: { gt: new Date(now.getTime() - DAY_MS) },
        },
      }),
    );
  }
}

function key(email: string): string {
  return email.trim().toLowerCase();
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function unique(list: Array<Contact | null>): Contact[] {
  const seen = new Map<string, Contact>();
  for (const contact of list) {
    if (contact && !seen.has(key(contact.email))) seen.set(key(contact.email), contact);
  }
  return [...seen.values()];
}

function firstName(name?: string): string | undefined {
  return name?.split(/\s+/)[0] || undefined;
}
