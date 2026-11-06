import { useCallback, useEffect, useState } from 'react';
import {
  BRANDED_EMAIL_MONTHLY_LIMIT,
  PLAN_ALWAYS_INCLUDED,
  PLAN_CAPABILITIES,
  PLAN_CAPABILITY_INFO,
  PLAN_LIMIT_LABELS,
  formatPlanLimit,
  isMercadoPagoCheckoutUrl,
  priceWithIva,
  type PlanCheckoutView,
  type OrganizationPlanView,
  type PlanDefinition,
  type PlanKey,
  type PlanLimit,
} from '@adoptafacil/contracts';
import {
  Badge,
  buttonVariants,
  cn,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Button,
  ErrorState,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { officialWhatsappUrl } from '../../../lib/contact';
import { isMercadoPagoProvider } from '../../payments/lib/payment-provider';

/** Labels, limits and the always-free list come from the plan catalog in
 *  `@adoptafacil/contracts`, the same one the landing uses. */
const LIMIT_LABELS = PLAN_LIMIT_LABELS;
const formatLimit = formatPlanLimit;

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const count = new Intl.NumberFormat('es-CO');

/** Dates are stored in UTC; Colombia time is for display only. */
const colombiaDate = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeZone: 'America/Bogota',
});

/** Where a shelter asks for a paid plan while billing is manual (payment link
 *  or transfer to AdoptaFácil + electronic invoice). `VITE_BILLING_CONTACT_URL`
 *  overrides it; by default the official WhatsApp opens with the plan written. */
const BILLING_CONTACT_URL = import.meta.env.VITE_BILLING_CONTACT_URL as string | undefined;

function planRequestUrl(plan: PlanDefinition): string {
  if (BILLING_CONTACT_URL) {
    return `${BILLING_CONTACT_URL}${BILLING_CONTACT_URL.includes('?') ? '&' : '?'}plan=${plan.key}`;
  }
  return officialWhatsappUrl(
    `Hola, quiero el plan ${plan.name} de AdoptaFácil para mi organización.`,
  );
}

/**
 * ADR-PAG-003: pagar el plan cada mes con Mercado Pago. Es ingreso de
 * AdoptaFácil por el software, así que se cobra con la cuenta de Mercado Pago
 * de AdoptaFácil (nunca con la del refugio ni con sus donaciones). Si el pago
 * en línea aún no está activo, se ofrece pedirlo por WhatsApp.
 */
function PayWithMercadoPagoButton({ plan }: { plan: PlanDefinition }) {
  const client = useApiClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const pay = async () => {
    setBusy(true);
    try {
      const view = await client.request<PlanCheckoutView>('/org/plan/checkout', {
        method: 'POST',
        json: { plan: plan.key },
      });
      if (!isMercadoPagoCheckoutUrl(view.checkoutUrl)) throw new Error('bad checkout url');
      window.location.assign(view.checkoutUrl);
    } catch {
      setBusy(false);
      toast({
        title: 'El pago en línea del plan aún no está disponible',
        description: 'Escríbenos por WhatsApp y lo activamos contigo.',
        variant: 'destructive',
      });
    }
  };
  return (
    <Button
      className="w-full"
      onClick={pay}
      disabled={busy}
      data-testid={`plan-pay-mercadopago-${plan.key}`}
    >
      {busy ? 'Abriendo Mercado Pago…' : `Pagar ${plan.name} con Mercado Pago`}
    </Button>
  );
}

function PlanCard({
  plan,
  current,
  enforced,
}: {
  plan: PlanDefinition;
  current: boolean;
  enforced: boolean;
}) {
  const paid = plan.monthlyPriceCop > 0;
  // While plans are not enforced every org already has Pro for free: never
  // offer to charge for it (the API answers 409 too).
  const onlineBilling = enforced && isMercadoPagoProvider();
  const included = PLAN_CAPABILITIES.filter((capability) => plan.capabilities[capability]);
  return (
    <Card className={current ? 'border-primary ring-2 ring-primary/30' : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{plan.name}</CardTitle>
          {current ? (
            <Badge variant="success">Tu plan</Badge>
          ) : (
            paid && <Badge variant="outline">Opcional</Badge>
          )}
        </div>
        <CardDescription>{plan.tagline}</CardDescription>
        <p className="pt-2 text-2xl font-semibold">
          {paid ? cop.format(plan.monthlyPriceCop) : 'Gratis, siempre'}
          {paid && <span className="text-sm font-normal text-muted-foreground"> /mes + IVA</span>}
        </p>
        {paid && (
          <p className="text-xs text-muted-foreground">
            {cop.format(priceWithIva(plan.monthlyPriceCop))} con IVA, o{' '}
            {cop.format(plan.annualPriceCop)} al año + IVA (2 meses gratis)
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="space-y-1">
          {(Object.keys(plan.limits) as PlanLimit[]).map((limit) => (
            <li key={limit} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{LIMIT_LABELS[limit]}</span>
              <span className="font-medium">{formatLimit(limit, plan.limits[limit])}</span>
            </li>
          ))}
        </ul>
        {included.length > 0 && (
          <ul className="list-inside list-disc space-y-1">
            {included.map((capability) => (
              <li key={capability}>
                {PLAN_CAPABILITY_INFO[capability].label}
                {capability === 'brandedEmails' &&
                  ` (hasta ${count.format(BRANDED_EMAIL_MONTHLY_LIMIT[plan.key])} al mes)`}
                {!PLAN_CAPABILITY_INFO[capability].available && (
                  <Badge variant="secondary" className="ml-2">
                    Próximamente
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {paid && !current && (
        <CardFooter className="flex flex-col gap-2">
          {onlineBilling && <PayWithMercadoPagoButton plan={plan} />}
          <a
            className={cn(
              buttonVariants({ variant: onlineBilling ? 'outline' : 'default' }),
              'w-full',
            )}
            href={planRequestUrl(plan)}
            target="_blank"
            rel="noreferrer"
            data-testid={`plan-request-${plan.key}`}
          >
            {onlineBilling ? 'Prefiero pagar por transferencia' : `Quiero el plan ${plan.name}`}
          </a>
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * Cancelar el plan (Estatuto del Consumidor: tan fácil como contratar). Pide
 * una confirmación en el mismo botón; Mercado Pago deja de cobrar y el plan
 * sigue hasta el fin de lo pagado.
 */
function CancelPlanButton({ onCanceled }: { onCanceled: () => void }) {
  const client = useApiClient();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    setBusy(true);
    try {
      await client.request('/org/plan/cancel', { method: 'POST' });
      toast({
        title: 'Plan cancelado',
        description: 'No se te volverá a cobrar. Lo puedes usar hasta el fin del periodo pagado.',
      });
      onCanceled();
    } catch {
      toast({
        title: 'No pudimos cancelar tu plan',
        description: 'No se canceló nada. Intenta de nuevo en unos minutos.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  if (!confirming) {
    return (
      <Button variant="outline" onClick={() => setConfirming(true)} data-testid="plan-cancel">
        Cancelar mi plan
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">
        ¿Seguro? Dejarás de pagar y al final del periodo pasas a Gratis.
      </span>
      <Button onClick={cancel} disabled={busy} data-testid="plan-cancel-confirm">
        Sí, cancelar
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
        No
      </Button>
    </div>
  );
}

/**
 * `/organizacion/plan` — Plan y facturación (Owner/Administrator, same roles as
 * `GET /org/plan`). Shows the plan in effect, how much of each limit is used,
 * and the three plans side by side. While plans are not enforced it says so:
 * the organization has everything and nothing is charged.
 */
export function OrgPlanPage() {
  const client = useApiClient();
  const [view, setView] = useState<OrganizationPlanView | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    client
      .request<OrganizationPlanView>('/org/plan')
      .then(setView)
      .catch(() => setFailed(true));
  }, [client]);

  useEffect(load, [load]);

  if (failed) {
    return (
      <PageContainer>
        <PageHeader title="Plan y facturación" />
        <ErrorState description="No pudimos cargar tu plan." onRetry={load} />
      </PageContainer>
    );
  }

  if (!view) {
    return (
      <PageContainer>
        <PageHeader title="Plan y facturación" />
        <Skeleton className="h-40 w-full" />
      </PageContainer>
    );
  }

  const current: PlanKey = view.effectivePlan;
  const currentName = view.catalog.find((plan) => plan.key === current)?.name ?? current;
  const periodEnd = view.subscription?.currentPeriodEnd;
  const membersMax = view.limits.members;

  return (
    <PageContainer>
      <PageHeader
        title="Plan y facturación"
        description="Lo que protege a los animales y la transparencia es gratis siempre. Los planes de pago son opcionales: suman marca, alcance y comodidad."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            Estás en el plan {currentName}
            {view.subscription && view.subscription.discountPercent > 0 && (
              <Badge variant="info" className="ml-2">
                {view.subscription.discountPercent} % de descuento fundador
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {!view.enforced
              ? 'Durante el piloto tienes todas las funciones sin costo.'
              : view.launchPromoEndsAt
                ? `Lanzamiento: tienes Pro gratis hasta el ${colombiaDate.format(new Date(view.launchPromoEndsAt))}. Después pasas a Gratis, salvo que elijas un plan; tus datos no se pierden y tu portal vuelve a una plantilla gratuita.`
                : periodEnd && view.subscription?.status === 'canceled'
                  ? `Cancelaste tu plan: lo puedes usar hasta el ${colombiaDate.format(new Date(periodEnd))} y no se te volverá a cobrar. Después pasas a Gratis sin perder tus datos.`
                  : periodEnd
                    ? `Se renueva el ${colombiaDate.format(new Date(periodEnd))}.`
                    : current === 'free'
                      ? 'Sin costo y sin fecha de vencimiento.'
                      : 'Sin fecha de vencimiento.'}
            {view.graceEndsAt && view.subscription?.status === 'past_due' && (
              <>
                {' '}
                Tu pago está pendiente: si no se renueva antes del{' '}
                {colombiaDate.format(new Date(view.graceEndsAt))}, pasarás al plan Gratis sin perder
                tus datos.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {LIMIT_LABELS.members}: <strong>{view.usage.members}</strong>
            {membersMax !== null && ` de ${membersMax}`}
          </p>
          {view.usage.storageMb !== undefined && (
            <p className="text-sm">
              {LIMIT_LABELS.storageMb}:{' '}
              <strong>{formatLimit('storageMb', view.usage.storageMb)}</strong>
              {view.limits.storageMb !== null &&
                ` de ${formatLimit('storageMb', view.limits.storageMb)}`}
            </p>
          )}
          {view.usage.brandedEmails && (
            <p className="text-sm">
              Correos con tu marca este mes:{' '}
              <strong>{count.format(view.usage.brandedEmails.sent)}</strong> de{' '}
              {count.format(view.usage.brandedEmails.limit)}. Pasado el tope, tus correos siguen
              saliendo con la marca de AdoptaFácil.
            </p>
          )}
        </CardContent>
        {view.enforced &&
          view.subscription &&
          view.subscription.plan !== 'free' &&
          view.subscription.status !== 'canceled' && (
            <CardFooter>
              <CancelPlanButton onCanceled={load} />
            </CardFooter>
          )}
      </Card>

      <section aria-labelledby="always-included" className="mt-6">
        <h2 id="always-included" className="mb-2 text-lg font-semibold">
          Incluido en todos los planes
        </h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {PLAN_ALWAYS_INCLUDED.map((item) => (
            <li key={item}>✓ {item}</li>
          ))}
        </ul>
      </section>

      <section aria-label="Planes" className="mt-6 grid gap-4 md:grid-cols-3">
        {view.catalog.map((plan) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            current={view.enforced && plan.key === current}
            enforced={view.enforced}
          />
        ))}
      </section>
    </PageContainer>
  );
}
