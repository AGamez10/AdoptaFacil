import { useCallback, useEffect, useState } from 'react';
import {
  PLAN_CAPABILITIES,
  priceWithIva,
  type OrganizationPlanView,
  type PlanCapability,
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
  ErrorState,
  Skeleton,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';

/** What each paid capability means for a shelter, in its own words. */
const CAPABILITY_LABELS: Record<PlanCapability, string> = {
  portalAllDesigns: 'Los 4 diseños de portal público',
  portalAdvancedCustomization: 'Personalización avanzada del portal',
  portalRemoveSeal: 'Portal sin el sello "Hecho con AdoptaFácil"',
  customDomain: 'Dominio propio (www.turefugio.org)',
  brandedEmails: 'Correos a adoptantes y donantes con tu marca',
  dataExport: 'Exportar tus datos a Excel',
  impactReport: 'Reporte de impacto en PDF para donantes',
  corporateSponsorship: 'Patrocinio de empresas',
  prioritySupport: 'Soporte prioritario por WhatsApp',
};

/** Included in every plan, free too: what protects the animal, the adopter and
 *  transparency is never sold. */
const ALWAYS_INCLUDED = [
  'Animales ilimitados con ficha clínica',
  'Adopciones con contrato y seguimiento',
  'Recaudo de donaciones, también si aún no estás formalizado',
  'Comprobantes de donación y documentos de la organización',
  'Portal público en tu subdominio',
];

const LIMIT_LABELS: Record<PlanLimit, string> = {
  members: 'Miembros del equipo',
  storageMb: 'Almacenamiento',
  portalDesigns: 'Diseños de portal',
};

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** Dates are stored in UTC; Colombia time is for display only. */
const colombiaDate = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeZone: 'America/Bogota',
});

function formatLimit(limit: PlanLimit, value: number | null): string {
  if (value === null) return 'Sin límite';
  if (limit === 'storageMb') return value >= 1024 ? `${value / 1024} GB` : `${value} MB`;
  return String(value);
}

/** Where a shelter asks for a paid plan while billing is manual (payment link
 *  or transfer to AdoptaFácil + electronic invoice). TODO(client): canal real. */
const BILLING_CONTACT_URL = import.meta.env.VITE_BILLING_CONTACT_URL;

function PlanCard({ plan, current }: { plan: PlanDefinition; current: boolean }) {
  const paid = plan.monthlyPriceCop > 0;
  const included = PLAN_CAPABILITIES.filter((capability) => plan.capabilities[capability]);
  return (
    <Card className={current ? 'border-primary ring-2 ring-primary/30' : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{plan.name}</CardTitle>
          {current && <Badge variant="success">Tu plan</Badge>}
        </div>
        <CardDescription>{plan.tagline}</CardDescription>
        <p className="pt-2 text-2xl font-semibold">
          {paid ? cop.format(plan.monthlyPriceCop) : 'Gratis'}
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
              <li key={capability}>{CAPABILITY_LABELS[capability]}</li>
            ))}
          </ul>
        )}
      </CardContent>
      {paid && !current && (
        <CardFooter>
          {BILLING_CONTACT_URL ? (
            <a
              className={cn(buttonVariants(), 'w-full')}
              href={`${BILLING_CONTACT_URL}${BILLING_CONTACT_URL.includes('?') ? '&' : '?'}plan=${plan.key}`}
              target="_blank"
              rel="noreferrer"
            >
              Quiero el plan {plan.name}
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">
              Muy pronto podrás pasarte a {plan.name} desde aquí.
            </p>
          )}
        </CardFooter>
      )}
    </Card>
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
        description="Lo que protege a los animales y la transparencia es gratis siempre. Los planes suman marca, alcance y comodidad."
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
        </CardContent>
      </Card>

      <section aria-labelledby="always-included" className="mt-6">
        <h2 id="always-included" className="mb-2 text-lg font-semibold">
          Incluido en todos los planes
        </h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {ALWAYS_INCLUDED.map((item) => (
            <li key={item}>✓ {item}</li>
          ))}
        </ul>
      </section>

      <section aria-label="Planes" className="mt-6 grid gap-4 md:grid-cols-3">
        {view.catalog.map((plan) => (
          <PlanCard key={plan.key} plan={plan} current={view.enforced && plan.key === current} />
        ))}
      </section>
    </PageContainer>
  );
}
