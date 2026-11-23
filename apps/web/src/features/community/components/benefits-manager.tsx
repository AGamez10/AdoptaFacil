import { useEffect, useState, type FormEvent } from 'react';
import {
  BUSINESS_MAX_BENEFITS,
  BusinessBenefitStatus,
  ServiceListingStatus,
  type BusinessBenefit,
  type ServiceListing,
} from '@adoptafacil/contracts';
import { Badge, Button, Input, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import {
  BENEFIT_IDEAS,
  BENEFIT_STATUS_LABELS,
  BENEFIT_STATUS_VARIANT,
  dayLabel,
} from '../model/business-view';

interface FormState {
  listingId: string;
  title: string;
  description: string;
  terms: string;
  validUntil: string;
}

const EMPTY: FormState = { listingId: '', title: '', description: '', terms: '', validUntil: '' };

/**
 * Beneficios para quien adopta (dentro del panel). Nacen "En revisión";
 * editar el texto los devuelve a revisión; pausar no. Hasta
 * `BUSINESS_MAX_BENEFITS` activos a la vez.
 */
export function BenefitsManager({
  listings,
  onChange,
}: {
  listings: ServiceListing[];
  onChange?: () => void;
}) {
  const client = useApiClient();
  const { toast } = useToast();
  const [benefits, setBenefits] = useState<BusinessBenefit[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const rows = await client.request<BusinessBenefit[]>('/community/business/benefits');
    setBenefits(Array.isArray(rows) ? rows : []);
  };

  useEffect(() => {
    void load().catch(() => undefined);
  }, [client]);

  const activeCount = benefits.filter(
    (b) =>
      b.active &&
      (b.status === BusinessBenefitStatus.Pending || b.status === BusinessBenefitStatus.Approved),
  ).length;
  const listingName = (id: string) => listings.find((l) => l.id === id)?.name ?? 'tu negocio';

  const open = (benefit?: BusinessBenefit) => {
    setEditingId(benefit?.id ?? null);
    setForm(
      benefit
        ? {
            listingId: benefit.listingId,
            title: benefit.title,
            description: benefit.description ?? '',
            terms: benefit.terms ?? '',
            validUntil: benefit.validUntil ?? '',
          }
        : { ...EMPTY, listingId: listings[0]?.id ?? '' },
    );
    setShowForm(true);
  };

  const afterSave = async (title: string, description?: string) => {
    toast({ title, ...(description ? { description } : {}) });
    await load();
    onChange?.();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await client.request(`/community/business/benefits/${editingId}`, {
          method: 'PATCH',
          json: {
            title: form.title.trim(),
            description: form.description.trim() || null,
            terms: form.terms.trim() || null,
            validUntil: form.validUntil || null,
          },
        });
      } else {
        await client.request('/community/business/benefits', {
          method: 'POST',
          json: {
            listingId: form.listingId,
            title: form.title.trim(),
            ...(form.description.trim() ? { description: form.description.trim() } : {}),
            ...(form.terms.trim() ? { terms: form.terms.trim() } : {}),
            ...(form.validUntil ? { validUntil: form.validUntil } : {}),
          },
        });
      }
      setShowForm(false);
      setEditingId(null);
      await afterSave('Beneficio enviado a revisión', 'Lo publicaremos cuando lo aprobemos.');
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : 'Revisa los datos.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (benefit: BusinessBenefit) => {
    try {
      await client.request(`/community/business/benefits/${benefit.id}`, {
        method: 'PATCH',
        json: { active: !benefit.active },
      });
      await afterSave(benefit.active ? 'Beneficio pausado' : 'Beneficio reanudado');
    } catch (error) {
      toast({
        title: 'No se pudo cambiar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const hasListing = listings.length > 0;
  const hasApprovedListing = listings.some((l) => l.status === ServiceListingStatus.Approved);

  return (
    <section aria-labelledby="benefits-title" className="space-y-4" id="beneficios">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="benefits-title" className="text-lg font-bold">
            Beneficio para quien adopta
          </h2>
          <p className="text-sm text-muted-foreground">
            Lo ven en su cuenta las personas que adoptaron en AdoptaFácil. Te traen clientes que
            llegan con una mascota nueva.
          </p>
        </div>
        {hasListing && !showForm && activeCount < BUSINESS_MAX_BENEFITS && (
          <Button onClick={() => open()} data-testid="new-benefit">
            {benefits.length === 0 ? 'Crear mi beneficio' : 'Nuevo beneficio'}
          </Button>
        )}
      </div>

      {!hasListing && (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          Primero crea tu perfil en el directorio (abajo). El beneficio se muestra junto a él.
        </p>
      )}

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
        >
          {!editingId && listings.length > 1 && (
            <label className="space-y-1 text-sm font-semibold sm:col-span-2">
              ¿En qué sede?
              <select
                value={form.listingId}
                onChange={(event) => setForm({ ...form, listingId: event.target.value })}
                className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-normal"
              >
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.name} · {listing.city}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="space-y-1 text-sm font-semibold sm:col-span-2">
            ¿Qué ofreces?
            <Input
              required
              minLength={4}
              maxLength={80}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Ej.: Primera consulta gratis para animales adoptados"
            />
          </label>
          {!editingId && (
            <div className="flex flex-wrap gap-2 sm:col-span-2" aria-label="Ideas">
              {BENEFIT_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setForm({ ...form, title: idea })}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5"
                >
                  {idea}
                </button>
              ))}
            </div>
          )}
          <label className="space-y-1 text-sm font-semibold sm:col-span-2">
            Detalle (opcional)
            <textarea
              maxLength={400}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              className="block min-h-20 w-full rounded-lg border border-input bg-background p-3 font-normal"
              placeholder="Qué incluye exactamente."
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            Condiciones (opcional)
            <textarea
              maxLength={400}
              value={form.terms}
              onChange={(event) => setForm({ ...form, terms: event.target.value })}
              className="block min-h-20 w-full rounded-lg border border-input bg-background p-3 font-normal"
              placeholder="Ej.: Una vez por animal. Lunes a viernes, con cita."
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            Válido hasta (opcional)
            <Input
              type="date"
              value={form.validUntil}
              onChange={(event) => setForm({ ...form, validUntil: event.target.value })}
            />
            <span className="block text-xs font-normal text-muted-foreground">
              Sin fecha, sigue vigente hasta que lo pauses.
            </span>
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Tú ofreces y cumples este beneficio. AdoptaFácil lo revisa para que sea claro, pero no
            responde por el servicio. Si no se cumple, podemos retirarlo y también el sello.
          </p>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {editingId ? 'Guardar y enviar a revisión' : 'Enviar a revisión'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {benefits.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {benefits.map((benefit) => (
            <li
              key={benefit.id}
              className="space-y-2 rounded-2xl border border-border bg-card p-4"
              data-testid="benefit-item"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold leading-snug">{benefit.title}</p>
                <Badge
                  variant={benefit.active ? BENEFIT_STATUS_VARIANT[benefit.status] : 'secondary'}
                >
                  {benefit.active ? BENEFIT_STATUS_LABELS[benefit.status] : 'Pausado'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {listingName(benefit.listingId)}
                {benefit.validUntil ? ` · hasta el ${dayLabel(benefit.validUntil)}` : ''}
              </p>
              {benefit.moderationReason && (
                <p className="text-sm text-muted-foreground">Motivo: {benefit.moderationReason}</p>
              )}
              {benefit.status === BusinessBenefitStatus.Approved &&
                benefit.active &&
                !hasApprovedListing && (
                  <p className="text-xs text-muted-foreground">
                    Se mostrará cuando tu perfil esté publicado.
                  </p>
                )}
              <div className="flex gap-3 text-sm">
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => open(benefit)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => void toggle(benefit)}
                >
                  {benefit.active ? 'Pausar' : 'Reanudar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
