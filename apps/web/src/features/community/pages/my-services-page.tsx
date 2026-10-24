import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  SERVICE_CATEGORIES,
  ServiceCategory,
  ServiceListingStatus,
  type ServiceListing,
  type ServiceListingInput,
} from '@adoptafacil/contracts';
import { Badge, Button, EmptyState, Input, Skeleton, useToast } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { SERVICE_CATEGORY_SINGULAR, SERVICE_STATUS_LABELS } from '../model/directory-view';

type FormState = Record<keyof ServiceListingInput, string>;

const EMPTY: FormState = {
  category: ServiceCategory.Veterinary,
  name: '',
  description: '',
  department: '',
  city: '',
  address: '',
  phone: '',
  whatsapp: '',
  website: '',
  email: '',
};

const STATUS_VARIANT = {
  [ServiceListingStatus.Pending]: 'warning',
  [ServiceListingStatus.Approved]: 'success',
  [ServiceListingStatus.Rejected]: 'destructive',
  [ServiceListingStatus.Hidden]: 'secondary',
} as const;

/** Solo envía los campos con texto: el servidor rechaza cadenas vacías. */
export function toListingPayload(form: FormState): ServiceListingInput {
  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(form)) {
    if (value.trim()) payload[key] = value.trim();
  }
  return payload as unknown as ServiceListingInput;
}

const FIELDS: Array<{ key: keyof FormState; label: string; required?: boolean; type?: string }> = [
  { key: 'name', label: 'Nombre del negocio', required: true },
  { key: 'department', label: 'Departamento', required: true },
  { key: 'city', label: 'Ciudad', required: true },
  { key: 'address', label: 'Dirección' },
  { key: 'whatsapp', label: 'WhatsApp', type: 'tel' },
  { key: 'phone', label: 'Teléfono', type: 'tel' },
  { key: 'website', label: 'Sitio web (https://…)', type: 'url' },
  { key: 'email', label: 'Correo de contacto', type: 'email' },
];

/**
 * `/mi-negocio` (Comunidad): el negocio publica y edita su perfil en el
 * directorio. Todo perfil nace "En revisión" y vuelve a revisión al editarse.
 * Una Persona gestiona su propio perfil; en una organización, Owner/Administrator
 * (lo aplica el servidor: un 403 se muestra como mensaje).
 */
export function MyServicesPage() {
  const client = useApiClient();
  const { toast } = useToast();
  const [listings, setListings] = useState<ServiceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async (): Promise<void> => {
    try {
      const rows = await client.request<ServiceListing[]>('/community/services/mine');
      setListings(Array.isArray(rows) ? rows : []);
    } catch (error) {
      if ((error as { status?: number }).status === 403) setForbidden(true);
    }
  };

  useEffect(() => {
    let active = true;
    void load().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [client]);

  const startEdit = (listing: ServiceListing) => {
    setEditingId(listing.id);
    setForm({
      ...EMPTY,
      ...Object.fromEntries(
        Object.keys(EMPTY).map((key) => [key, String(listing[key as keyof ServiceListing] ?? '')]),
      ),
    } as FormState);
    setShowForm(true);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const json = toListingPayload(form);
      if (editingId) {
        await client.request(`/community/services/${editingId}`, { method: 'PATCH', json });
      } else {
        await client.request('/community/services', { method: 'POST', json });
      }
      toast({
        title: 'Perfil enviado a revisión',
        description: 'Lo publicaremos en el directorio cuando lo aprobemos.',
      });
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY);
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description:
          error instanceof Error ? error.message : 'Revisa los datos e inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Mi negocio"
        description="Publica gratis tu veterinaria, peluquería, servicio de paseo o tienda en el directorio de AdoptaFácil."
        actions={
          !forbidden && !showForm ? (
            <Button
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY);
                setShowForm(true);
              }}
            >
              Nuevo perfil
            </Button>
          ) : undefined
        }
      />

      {loading && <Skeleton className="h-40 w-full" />}
      {!loading && forbidden && (
        <EmptyState
          title="Sin permiso"
          description="En una organización, solo el representante o un administrador puede publicar perfiles."
        />
      )}

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="mb-8 grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
        >
          <label className="space-y-1 text-sm font-semibold sm:col-span-2">
            Tipo de servicio
            <select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-normal"
            >
              {SERVICE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {SERVICE_CATEGORY_SINGULAR[value]}
                </option>
              ))}
            </select>
          </label>
          {FIELDS.map((field) => (
            <label key={field.key} className="space-y-1 text-sm font-semibold">
              {field.label}
              <Input
                type={field.type ?? 'text'}
                required={field.required}
                value={form[field.key]}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              />
            </label>
          ))}
          <label className="space-y-1 text-sm font-semibold sm:col-span-2">
            Descripción
            <textarea
              value={form.description}
              maxLength={1000}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              className="block min-h-24 w-full rounded-lg border border-input bg-background p-3 font-normal"
              placeholder="Qué ofreces, horarios, si atiendes urgencias o a domicilio."
            />
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Publica solo datos de contacto del negocio. Al enviar, autorizas a AdoptaFácil a
            mostrarlos en el directorio público después de revisarlos.
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

      {!loading && !forbidden && listings.length === 0 && !showForm && (
        <EmptyState
          title="Aún no tienes un perfil"
          description="Crea uno y lo revisaremos antes de mostrarlo en el directorio."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {listings.map((listing) => (
          <article
            key={listing.id}
            className="space-y-2 rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {SERVICE_CATEGORY_SINGULAR[listing.category]} · {listing.city}
                </p>
                <h3 className="text-lg font-bold">{listing.name}</h3>
              </div>
              <Badge variant={STATUS_VARIANT[listing.status]}>
                {SERVICE_STATUS_LABELS[listing.status]}
              </Badge>
            </div>
            {listing.moderationReason && (
              <p className="text-sm text-muted-foreground">Motivo: {listing.moderationReason}</p>
            )}
            <div className="flex gap-3 text-sm">
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={() => startEdit(listing)}
              >
                Editar
              </button>
              {listing.status === ServiceListingStatus.Approved && (
                <Link
                  to={`/servicios/${listing.id}`}
                  className="font-semibold text-primary hover:underline"
                >
                  Ver en el directorio
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </PageContainer>
  );
}
