import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Role,
  PLAN_CATALOG,
  TRIAL_REMINDER_DAYS_BEFORE,
  graceEnd,
  type EmailEventKey,
  type PlanKey,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { NOTIFICATION_PORT, type NotificationPort } from '../notifications/notification.port';
import { PrismaService } from '../../prisma/prisma.service';
import { PlansService } from './plans.service';

/** Days before the end of a period that the first reminder goes out. */
export const PLAN_REMINDER_DAYS_BEFORE = 7;

const DAY = 24 * 60 * 60 * 1000;

export type PlanReminderKind = 'renewal_due' | 'payment_failed' | 'ending';

interface SubscriptionFields {
  plan: string;
  status: string;
  provider: string;
  currentPeriodEnd: Date | null;
}

/**
 * Which reminder (if any) a subscription needs at `now`. Pure.
 * - `renewal_due`: a plan paid by hand (`manual`) ends within 7 days: nobody
 *   charges it automatically, so the organization has to pay again.
 * - `payment_failed`: Mercado Pago could not charge it (`past_due`) or a paid
 *   period already ended: it keeps working until the grace days end.
 * - `ending`: the organization cancelled; the plan ends within 7 days.
 * A Mercado Pago plan that renews normally needs no reminder.
 */
export function planReminderFor(
  sub: SubscriptionFields,
  now: Date,
): { kind: PlanReminderKind; endsAt: Date } | null {
  if (sub.plan === 'free' || !sub.currentPeriodEnd) return null;
  const end = sub.currentPeriodEnd;
  const soon = end.getTime() - now.getTime() <= PLAN_REMINDER_DAYS_BEFORE * DAY;
  if (sub.status === 'canceled') {
    return end.getTime() >= now.getTime() && soon ? { kind: 'ending', endsAt: end } : null;
  }
  const grace = graceEnd(end);
  if (now.getTime() > grace.getTime()) return null; // ya volvió a Gratis
  if (sub.status === 'past_due' || end.getTime() < now.getTime()) {
    return { kind: 'payment_failed', endsAt: grace };
  }
  if (sub.provider === 'manual' && soon) return { kind: 'renewal_due', endsAt: end };
  return null;
}

/** Aviso del fin del Pro gratis (prueba de la organización nueva o lanzamiento). */
export type FreeProReminderStage = 'soon' | 'today';

/**
 * Qué aviso necesita una organización SIN suscripción cuyo Pro gratis termina
 * en `endsAt`. Puro. `soon`: faltan entre 1 y {@link TRIAL_REMINDER_DAYS_BEFORE}
 * días; `today`: termina en las próximas 24 horas. Ya vencido, ninguno.
 */
export function freeProReminderFor(endsAt: Date, now: Date): FreeProReminderStage | null {
  const left = endsAt.getTime() - now.getTime();
  if (left < 0) return null;
  if (left <= DAY) return 'today';
  if (left <= TRIAL_REMINDER_DAYS_BEFORE * DAY) return 'soon';
  return null;
}

const colombiaDate = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Subject and plain-text body of a reminder. Pure. */
export function planReminderMessage(
  kind: PlanReminderKind,
  organizationName: string,
  plan: PlanKey,
  endsAt: Date,
  planUrl: string,
): { subject: string; body: string } {
  const planName = PLAN_CATALOG[plan].name;
  const date = colombiaDate.format(endsAt);
  const keep =
    'No se borra nada: si tu plan termina, tus animales, adopciones y documentos siguen ahí y tu portal vuelve a una plantilla gratuita.';
  switch (kind) {
    case 'renewal_due':
      return {
        subject: `Tu plan ${planName} vence el ${date}`,
        body: `Hola, equipo de ${organizationName}:\n\nTu plan ${planName} de AdoptaFácil vence el ${date}. Para renovarlo, entra a ${planUrl}.\n\n${keep}`,
      };
    case 'payment_failed':
      return {
        subject: `No pudimos cobrar tu plan ${planName}`,
        body: `Hola, equipo de ${organizationName}:\n\nNo pudimos cobrar tu plan ${planName}. Sigue funcionando hasta el ${date}; revisa tu medio de pago en Mercado Pago o paga de nuevo en ${planUrl}.\n\n${keep}`,
      };
    case 'ending':
      return {
        subject: `Tu plan ${planName} termina el ${date}`,
        body: `Hola, equipo de ${organizationName}:\n\nCancelaste tu plan ${planName}; lo puedes usar hasta el ${date} y no se te volverá a cobrar. Si cambias de opinión, elige un plan en ${planUrl}.\n\n${keep}`,
      };
  }
}

/** Evento de correo (plantilla de marca) de cada recordatorio de plan. */
const PLAN_REMINDER_EVENT: Record<PlanReminderKind, EmailEventKey> = {
  renewal_due: 'plan.renewal_due',
  payment_failed: 'plan.payment_failed',
  ending: 'plan.ending',
};

function freeProWhat(reason: 'launch' | 'trial'): string {
  return reason === 'trial' ? 'Tu prueba gratis de Pro' : 'Tu Pro gratis del lanzamiento';
}

function freeProWhen(stage: FreeProReminderStage, endsAt: Date): string {
  return stage === 'today' ? 'termina hoy' : `termina el ${colombiaDate.format(endsAt)}`;
}

/** Asunto y cuerpo del aviso de fin del Pro gratis. Puro. */
export function freeProReminderMessage(
  stage: FreeProReminderStage,
  reason: 'launch' | 'trial',
  organizationName: string,
  endsAt: Date,
  planUrl: string,
): { subject: string; body: string } {
  const what = freeProWhat(reason);
  const when = freeProWhen(stage, endsAt);
  return {
    subject: `${what} ${when}`,
    body: `Hola, equipo de ${organizationName}:\n\n${what} en AdoptaFácil ${when}. Después tu organización pasa al plan Gratis.\n\nNo se borra nada: tus animales, adopciones y documentos siguen ahí. Si tu portal usa una plantilla Pro, vuelve solo a una gratuita; la que elegiste queda guardada y regresa en cuanto actives Crece o Pro en ${planUrl}.`,
  };
}

/**
 * Daily scan: emails the Owners of each organization whose plan needs a
 * reminder (see {@link planReminderFor}). Only with `PLAN_ENFORCEMENT` on.
 * Each email carries an idempotency key per organization, kind and date, so
 * running the scan every day sends each reminder once (the delivery queue
 * drops repeats within 7 days).
 */
@Injectable()
export class PlanRemindersService {
  private readonly logger = new Logger('PlanReminders');
  private readonly planUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    config: ConfigService<Env, true>,
  ) {
    const web = String(config.get('WEB_BASE_URL', { infer: true }) ?? '').replace(/\/+$/, '');
    this.planUrl = `${web}/organizacion/plan`;
  }

  /** Returns how many emails were queued. */
  async sendDueReminders(now = new Date()): Promise<number> {
    if (!this.plans.enforced) return 0;
    const orgs = await this.prisma.organization.findMany({
      select: { id: true, name: true, createdAt: true },
    });
    let sent = 0;
    for (const org of orgs) {
      try {
        sent += await this.remindOrganization(org.id, org.name, org.createdAt, now);
      } catch (error) {
        this.logger.warn(`plan reminder skipped for an organization: ${(error as Error).message}`);
      }
    }
    return sent;
  }

  private async remindOrganization(
    organizationId: string,
    organizationName: string,
    createdAt: Date,
    now: Date,
  ): Promise<number> {
    const free = this.plans.freeProFor(createdAt);
    const found = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const sub = await tx.organizationSubscription.findUnique({ where: { organizationId } });
      // Sin suscripción: el aviso es el del fin del Pro gratis (prueba o lanzamiento).
      const stage = !sub && free ? freeProReminderFor(free.endsAt, now) : null;
      // Con una bajada programada no hay "tu plan termina": sigue el plan nuevo.
      const due = sub && !sub.scheduledPlan ? planReminderFor(sub, now) : null;
      if (!due && !stage) return null;
      const owners = await tx.userRole.findMany({
        where: { organizationId, role: Role.Owner },
        select: { userId: true },
      });
      const users = await tx.user.findMany({
        where: { id: { in: owners.map((o) => o.userId) } },
        select: { email: true },
      });
      return { sub, due, stage, emails: users.map((u) => u.email).filter(Boolean) };
    });
    if (found?.stage && free) {
      const { subject, body } = freeProReminderMessage(
        found.stage,
        free.reason,
        organizationName,
        free.endsAt,
        this.planUrl,
      );
      const day = free.endsAt.toISOString().slice(0, 10);
      const what = freeProWhat(free.reason);
      for (const to of found.emails) {
        await this.notifications.send({
          to,
          subject,
          body,
          idempotencyKey: `plan.free-pro:${organizationId}:${found.stage}:${day}:${to}`,
          template: {
            event: 'plan.free_pro_ending',
            organizationName,
            data: {
              que: what,
              cuando: freeProWhen(found.stage, free.endsAt),
              enlace: this.planUrl,
            },
          },
        });
      }
      return found.emails.length;
    }
    if (!found?.due || !found.sub) return 0;
    const { subject, body } = planReminderMessage(
      found.due.kind,
      organizationName,
      found.sub.plan as PlanKey,
      found.due.endsAt,
      this.planUrl,
    );
    const day = found.due.endsAt.toISOString().slice(0, 10);
    for (const to of found.emails) {
      await this.notifications.send({
        to,
        subject,
        body,
        idempotencyKey: `plan.reminder:${organizationId}:${found.due.kind}:${day}:${to}`,
        template: {
          event: PLAN_REMINDER_EVENT[found.due.kind],
          organizationName,
          data: {
            plan: PLAN_CATALOG[found.sub.plan as PlanKey].name,
            fecha: found.due.endsAt.toISOString(),
            enlace: this.planUrl,
          },
        },
      });
    }
    return found.emails.length;
  }
}
