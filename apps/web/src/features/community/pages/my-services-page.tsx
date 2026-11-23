import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BUSINESS_COMMERCIAL_CONSENT_TEXT,
  type BenefitRedemptionRecord,
  type BusinessAccount,
  type BusinessOverview,
  type ServiceListing,
} from '@adoptafacil/contracts';
import { Button, EmptyState, Skeleton, cn, useToast } from '@adoptafacil/ui';
import { PageContainer } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { BUSINESS_ACTIVATED_EVENT } from '../../../shell/navigation';
import { BenefitsManager } from '../components/benefits-manager';
import { AllySeal, ImpactStat } from '../components/business-ui';
import { ListingManager } from '../components/listing-manager';
import { RedeemCard } from '../components/redeem-card';
import { PartnerBadge } from '../components/service-card';
import { ALLY_STEP_COPY } from '../model/business-view';

const dateFmt = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Bogota',
});

/** Activar el panel: un paso, con la autorización comercial OPCIONAL aparte. */
function ActivationCard({ onActivated }: { onActivated: () => void }) {
  const client = useApiClient();
  const { toast } = useToast();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const activate = async () => {
    setBusy(true);
    try {
      await client.request<BusinessAccount>('/community/business/activate', {
        method: 'POST',
        json: { commercialConsent: consent },
      });
      window.dispatchEvent(new Event(BUSINESS_ACTIVATED_EVENT));
      onActivated();
    } catch (error) {
      if ((error as { status?: number }).status === 403) setForbidden(true);
      else
        toast({
          title: 'No pudimos activar tu panel',
          description: 'Inténtalo de nuevo.',
          variant: 'destructive',
        });
    } finally {
      setBusy(false);
    }
  };

  if (forbidden) {
    return (
      <EmptyState
        title="Sin permiso"
        description="En una organización, solo el representante o un administrador puede activar el panel de negocio."
      />
    );
  }

  return (
    <section
      className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
      data-testid="business-activation"
    >
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-teal-dark">
            Negocios aliados
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Activa el panel de tu negocio
          </h1>
          <p className="mt-2 max-w-xl text-sm text-foreground/80">
            Desde aquí publicas tu perfil en el directorio, ofreces un beneficio a quienes adoptan,
            validas sus códigos y ves el impacto de tu negocio en los refugios. Es gratis.
          </p>
          <ul className="mt-4 space-y-1 text-sm">
            <li>✓ Tu perfil en Servicios para mascotas, revisado por nosotros.</li>
            <li>✓ Clientes nuevos: familias que acaban de adoptar.</li>
            <li>✓ El camino al sello "Aliado de AdoptaFácil".</li>
          </ul>
        </div>
        <div className="hidden md:block">
          <AllySeal size="lg" muted />
        </div>
      </div>
      <div className="space-y-4 border-t border-border bg-muted/30 p-6 md:px-8">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            data-testid="commercial-consent"
          />
          <span>
            <span className="font-semibold">Opcional.</span> {BUSINESS_COMMERCIAL_CONSENT_TEXT}
          </span>
        </label>
        <Button onClick={() => void activate()} disabled={busy} data-testid="activate-business">
          {busy ? 'Activando…' : 'Activar mi panel de negocio'}
        </Button>
      </div>
    </section>
  );
}

/** El camino al sello: tres pasos y qué falta. */
function AllyPath({ overview }: { overview: BusinessOverview }) {
  const { ally } = overview;
  if (ally.isAlly) {
    return (
      <section className="flex flex-col items-start gap-5 rounded-3xl bg-brand-gold/20 p-6 sm:flex-row sm:items-center">
        <AllySeal size="md" />
        <div>
          <h2 className="text-xl font-extrabold">Eres Aliado de AdoptaFácil</h2>
          <p className="mt-1 text-sm text-foreground/80">
            Tu sello aparece en tu perfil y sales primero en el directorio de tu ciudad. Gracias por
            estar del lado de los animales.
          </p>
        </div>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="ally-title"
      className="rounded-3xl border border-border bg-card p-6"
      data-testid="ally-path"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <AllySeal size="sm" muted={!ally.eligible} />
        <div>
          <h2 id="ally-title" className="text-xl font-extrabold">
            {ally.eligible ? '¡Cumples los requisitos del sello!' : 'Tu camino al sello de aliado'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {ally.eligible
              ? 'El equipo de AdoptaFácil revisa tu negocio y te otorga el sello. Te avisaremos.'
              : 'Necesitas tu perfil publicado y, además, un aporte entregado o un beneficio vigente.'}
          </p>
        </div>
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {ally.steps.map((step, index) => (
          <li
            key={step.key}
            className={cn(
              'rounded-2xl border p-4',
              step.done ? 'border-brand-teal/40 bg-brand-teal/10' : 'border-dashed border-border',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold',
                step.done ? 'bg-brand-teal text-white' : 'bg-muted text-muted-foreground',
              )}
            >
              {step.done ? '✓' : index + 1}
            </span>
            <p className="mt-2 text-sm font-bold">
              {ALLY_STEP_COPY[step.key].title}
              <span className="sr-only">{step.done ? ' (hecho)' : ' (pendiente)'}</span>
            </p>
            {!step.done && (
              <p className="mt-1 text-xs text-muted-foreground">{ALLY_STEP_COPY[step.key].hint}</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Autorización comercial: se da o se retira cuando quiera (Ley 1581). */
function ConsentCard({
  account,
  onChange,
}: {
  account: BusinessAccount;
  onChange: (account: BusinessAccount) => void;
}) {
  const client = useApiClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const flip = async () => {
    setBusy(true);
    try {
      const next = await client.request<BusinessAccount>('/community/business/consent', {
        method: 'PATCH',
        json: { commercialConsent: !account.commercialConsent },
      });
      onChange(next);
      toast({
        title: next.commercialConsent ? 'Autorización guardada' : 'Autorización retirada',
      });
    } catch {
      toast({ title: 'No se pudo guardar', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-labelledby="consent-title"
      className="rounded-2xl border border-border bg-card p-5"
    >
      <h2 id="consent-title" className="text-lg font-bold">
        Novedades para tu negocio
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{BUSINESS_COMMERCIAL_CONSENT_TEXT}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">
          {account.commercialConsent ? 'Autorizado' : 'No autorizado'}
        </span>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void flip()}>
          {account.commercialConsent ? 'Retirar autorización' : 'Autorizar'}
        </Button>
        <Link to="/uso-de-mis-datos" className="text-sm font-semibold text-primary hover:underline">
          Uso de mis datos
        </Link>
      </div>
    </section>
  );
}

/**
 * `/mi-negocio` · Panel del negocio aliado. Sin panel activo, una tarjeta para
 * activarlo. Activo: el camino al sello, el impacto comprobable, validar
 * códigos, el beneficio para quien adopta, cómo aportar a los refugios, el
 * perfil en el directorio y la autorización comercial.
 */
export function MyServicesPage() {
  const client = useApiClient();
  const [overview, setOverview] = useState<BusinessOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [listings, setListings] = useState<ServiceListing[]>([]);
  const [redemptions, setRedemptions] = useState<BenefitRedemptionRecord[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await client.request<BusinessOverview>('/community/business/me');
      setOverview(data);
      setFailed(false);
      if (data.account) {
        const rows = await client
          .request<BenefitRedemptionRecord[]>('/community/business/redemptions')
          .catch(() => []);
        setRedemptions(Array.isArray(rows) ? rows : []);
      }
    } catch {
      setFailed(true);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (failed) {
    return (
      <PageContainer>
        <EmptyState
          title="No se pudo cargar tu panel"
          description="Inténtalo de nuevo más tarde."
        />
      </PageContainer>
    );
  }
  if (!overview) {
    return (
      <PageContainer>
        <Skeleton className="h-64 w-full rounded-3xl" />
      </PageContainer>
    );
  }
  if (!overview.account) {
    return (
      <PageContainer>
        <ActivationCard onActivated={() => void refresh()} />
      </PageContainer>
    );
  }

  const { impact, account } = overview;
  const main = listings[0];

  return (
    <PageContainer>
      <div className="space-y-8" data-testid="business-panel">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-teal-dark">
              Panel de negocio
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              {main?.name ?? 'Tu negocio'}
            </h1>
            {overview.ally.isAlly && <PartnerBadge className="mt-1" />}
          </div>
          <Link
            to="/negocios-aliados"
            className="text-sm font-semibold text-primary hover:underline"
          >
            Cómo funciona
          </Link>
        </header>

        <AllyPath overview={overview} />

        <section aria-labelledby="impact-title">
          <h2 id="impact-title" className="text-lg font-bold">
            Tu impacto
          </h2>
          <p className="text-sm text-muted-foreground">
            Solo cuenta lo que confirman otros: los refugios al recibir tus aportes y tu negocio al
            validar un código.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ImpactStat value={impact.sheltersSupported} label="Refugios apoyados" tone="teal" />
            <ImpactStat
              value={impact.contributionsDelivered}
              label="Aportes entregados"
              tone="navy"
            />
            <ImpactStat
              value={impact.adoptersBenefited}
              label="Familias que usaron tu beneficio"
              tone="gold"
              hint={
                impact.passesIssued ? `${impact.passesIssued} lo guardaron en su cuenta` : undefined
              }
            />
            <ImpactStat value={impact.liveBenefits} label="Beneficios vigentes" tone="coral" />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <RedeemCard onRedeemed={() => void refresh()} />
          <section
            aria-labelledby="contribute-title"
            className="rounded-2xl bg-brand-navy p-5 text-white"
          >
            <h2 id="contribute-title" className="text-lg font-bold">
              Aporta a los refugios
            </h2>
            <p className="mt-1 text-sm text-white/80">
              Mira lo que necesitan y ofrece lo que tu negocio tiene: alimento, baños, consultas.
              Cuando el refugio confirma la entrega, suma a tu impacto.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/recursos"
                className="rounded-full bg-brand-gold px-4 py-2 text-sm font-bold text-brand-navy hover:bg-brand-gold/90"
              >
                Ver qué necesitan
              </Link>
              <Link
                to="/mis-ofertas"
                className="rounded-full border border-white/40 px-4 py-2 text-sm font-semibold hover:bg-white/10"
              >
                Mis ofertas
              </Link>
            </div>
          </section>
        </div>

        <BenefitsManager listings={listings} onChange={() => void refresh()} />

        {redemptions.length > 0 && (
          <section aria-labelledby="redemptions-title">
            <h2 id="redemptions-title" className="text-lg font-bold">
              Últimos códigos validados
            </h2>
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
              {redemptions.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    <strong>{item.animalName}</strong> · {item.benefitTitle}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {dateFmt.format(new Date(item.redeemedAt))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ListingManager onListingsChange={setListings} />

        <ConsentCard
          account={account}
          onChange={(next) => setOverview({ ...overview, account: next })}
        />
      </div>
    </PageContainer>
  );
}
