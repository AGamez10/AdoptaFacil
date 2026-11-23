import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type {
  AdopterBenefitListing,
  AdopterBenefitStatus,
  BenefitPass,
} from '@adoptafacil/contracts';
import { Button, EmptyState, Skeleton, useToast } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { listAdopterBenefits } from '../api/business';
import { PassTicket } from '../components/business-ui';
import { PartnerBadge } from '../components/service-card';
import { SERVICE_CATEGORY_SINGULAR, whatsappHref } from '../model/directory-view';
import { dayLabel } from '../model/business-view';

/** "Luna", "Luna y Toby", "Luna, Toby y Max". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/**
 * `/beneficios` · Beneficios por adoptar. Quien tiene una adopción confirmada
 * guarda un beneficio y recibe un código de un solo uso para mostrar en el
 * negocio; el negocio nunca recibe sus datos. Sin adopción confirmada, ve la
 * vitrina y cómo se activan.
 */
export function AdopterBenefitsPage() {
  const client = useApiClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<AdopterBenefitStatus | null>(null);
  const [benefits, setBenefits] = useState<AdopterBenefitListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityInput, setCityInput] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void client
      .request<AdopterBenefitStatus>('/community/benefits/mine')
      .then((data) => {
        if (active) setStatus(data);
      })
      .catch(() => {
        if (active) setStatus({ eligible: false, adoptedAnimals: [], passes: [] });
      });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    listAdopterBenefits({ city, signal: controller.signal })
      .then((page) => setBenefits(page.items))
      .catch(() => setBenefits([]))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [city]);

  const passByBenefit = useMemo(() => {
    const map = new Map<string, BenefitPass>();
    for (const pass of status?.passes ?? []) map.set(pass.benefit.id, pass);
    return map;
  }, [status]);

  const getPass = async (benefitId: string) => {
    setBusy(benefitId);
    try {
      const pass = await client.request<BenefitPass>(`/community/benefits/${benefitId}/pass`, {
        method: 'POST',
      });
      setStatus((prev) =>
        prev ? { ...prev, passes: [pass, ...prev.passes.filter((p) => p.id !== pass.id)] } : prev,
      );
      toast({ title: 'Listo, ya tienes tu código', description: 'Muéstralo en el negocio.' });
    } catch (error) {
      toast({
        title: 'No pudimos darte el código',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setCity(cityInput.trim());
  };

  const usablePasses = (status?.passes ?? []).filter(
    (p) => p.benefitLive || p.status === 'redeemed',
  );

  return (
    <PageContainer>
      <PageHeader
        title="Beneficios por adoptar"
        description="Negocios aliados de AdoptaFácil que reciben con un regalo a las familias que adoptan."
      />

      {status === null ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : status.eligible ? (
        <div className="mb-6 rounded-2xl bg-brand-teal/10 p-5" data-testid="adopter-eligible">
          <p className="text-lg font-bold">
            Gracias por adoptar a {joinNames(status.adoptedAnimals.slice(0, 3))}.
          </p>
          <p className="text-sm text-foreground/80">
            Guarda los beneficios que te sirvan y muestra el código en el negocio. El negocio no
            recibe tus datos: solo ve el nombre de tu mascota y el mes de la adopción.
          </p>
        </div>
      ) : (
        <div className="mb-6 rounded-2xl bg-muted p-5" data-testid="adopter-not-eligible">
          <p className="font-bold">Se activan cuando adoptas</p>
          <p className="text-sm text-muted-foreground">
            Cuando el refugio confirme la entrega de tu animal en AdoptaFácil, podrás guardar estos
            beneficios y recibir tus códigos.{' '}
            <Link to="/adoptar" className="font-semibold text-primary hover:underline">
              Ver animales en adopción
            </Link>
          </p>
        </div>
      )}

      {usablePasses.length > 0 && (
        <section aria-labelledby="passes-title" className="mb-8">
          <h2 id="passes-title" className="mb-3 text-lg font-bold">
            Tus códigos
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {usablePasses.map((pass) => {
              const whatsapp = whatsappHref(pass.listingWhatsapp);
              return (
                <PassTicket
                  key={pass.id}
                  code={pass.code}
                  title={pass.benefit.title}
                  business={pass.listingName}
                  redeemed={pass.status === 'redeemed'}
                  footer={
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        {pass.listingAddress ? `${pass.listingAddress}, ` : ''}
                        {pass.listingCity}
                      </span>
                      {pass.benefit.validUntil && pass.status !== 'redeemed' && (
                        <span>Hasta el {dayLabel(pass.benefit.validUntil)}</span>
                      )}
                      {whatsapp && pass.status !== 'redeemed' && (
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-primary hover:underline"
                        >
                          Escribir por WhatsApp
                        </a>
                      )}
                    </span>
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="catalog-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="catalog-title" className="text-lg font-bold">
            Beneficios disponibles
          </h2>
          <form
            onSubmit={onSearch}
            className="flex overflow-hidden rounded-xl border-2 border-border bg-card focus-within:border-primary"
          >
            <label htmlFor="benefits-city" className="sr-only">
              Ciudad
            </label>
            <input
              id="benefits-city"
              value={cityInput}
              onChange={(event) => setCityInput(event.target.value)}
              placeholder="Tu ciudad"
              className="w-40 bg-transparent px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              className="bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Buscar
            </button>
          </form>
        </div>

        {loading && <Skeleton className="h-40 w-full rounded-2xl" />}
        {!loading && benefits.length === 0 && (
          <EmptyState
            title={city ? `Aún no hay beneficios en ${city}` : 'Muy pronto verás beneficios aquí'}
            description="Estamos sumando negocios aliados. ¿Conoces uno? Cuéntale de AdoptaFácil."
          />
        )}
        {!loading && benefits.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit) => {
              const pass = passByBenefit.get(benefit.id);
              return (
                <li
                  key={benefit.id}
                  className="flex flex-col rounded-2xl border border-border bg-card p-5"
                  data-testid="adopter-benefit"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {SERVICE_CATEGORY_SINGULAR[benefit.listingCategory]} · {benefit.listingCity}
                  </p>
                  <Link
                    to={`/servicios/${benefit.listingId}`}
                    className="font-semibold hover:underline"
                  >
                    {benefit.listingName}
                  </Link>
                  {benefit.listingIsPartner && <PartnerBadge className="mt-1 self-start" />}
                  <p className="mt-3 text-lg font-bold leading-snug">{benefit.title}</p>
                  {benefit.description && (
                    <p className="mt-1 text-sm text-foreground/80">{benefit.description}</p>
                  )}
                  {benefit.terms && (
                    <p className="mt-1 text-xs text-muted-foreground">{benefit.terms}</p>
                  )}
                  {benefit.validUntil && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Hasta el {dayLabel(benefit.validUntil)}
                    </p>
                  )}
                  <div className="mt-auto pt-4">
                    {pass ? (
                      <p className="rounded-full bg-brand-teal/10 py-2 text-center text-sm font-semibold text-brand-teal-dark">
                        {pass.status === 'redeemed' ? 'Ya lo usaste' : 'Guardado en tus códigos'}
                      </p>
                    ) : (
                      <Button
                        className="w-full"
                        disabled={!status?.eligible || busy === benefit.id}
                        onClick={() => void getPass(benefit.id)}
                      >
                        {status?.eligible ? 'Obtener mi código' : 'Disponible al adoptar'}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
