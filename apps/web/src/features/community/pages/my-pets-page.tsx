import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { PetProfile, PetProfileInput, PetSex, PetSpecies } from '@adoptafacil/contracts';
import { Button, EmptyState, Input, Skeleton, useToast } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { PET_SEX_LABELS, PET_SPECIES_LABELS, petAgeLabel } from '../model/directory-view';
import { dateBounds } from '../../../lib/date-rules';

interface PetForm {
  name: string;
  species: PetSpecies;
  breed: string;
  sex: PetSex | '';
  birthDate: string;
  sterilized: '' | 'yes' | 'no';
  adoptedFrom: string;
  notes: string;
}

const EMPTY: PetForm = {
  name: '',
  species: 'dog',
  breed: '',
  sex: '',
  birthDate: '',
  sterilized: '',
  adoptedFrom: '',
  notes: '',
};

export function toPetPayload(form: PetForm): PetProfileInput {
  return {
    name: form.name.trim(),
    species: form.species,
    ...(form.breed.trim() ? { breed: form.breed.trim() } : {}),
    ...(form.sex ? { sex: form.sex } : {}),
    ...(form.birthDate ? { birthDate: form.birthDate } : {}),
    ...(form.sterilized ? { sterilized: form.sterilized === 'yes' } : {}),
    ...(form.adoptedFrom.trim() ? { adoptedFrom: form.adoptedFrom.trim() } : {}),
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
  };
}

function toForm(pet: PetProfile): PetForm {
  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed ?? '',
    sex: pet.sex ?? '',
    birthDate: pet.birthDate ?? '',
    sterilized: pet.sterilized === undefined ? '' : pet.sterilized ? 'yes' : 'no',
    adoptedFrom: pet.adoptedFrom ?? '',
    notes: pet.notes ?? '',
  };
}

const selectClass =
  'block w-full rounded-lg border border-input bg-background px-3 py-2 font-normal';

/**
 * `/mis-mascotas` (Comunidad): ficha privada de cada mascota de una persona,
 * por ejemplo la que adoptó. Nadie más la ve. Desde aquí se llega al
 * directorio de servicios para cuidarla.
 */
export function MyPetsPage() {
  const client = useApiClient();
  const { user } = useSession();
  const { toast } = useToast();
  const isPerson = user?.accountType === 'person';
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<PetForm>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async (): Promise<void> => {
    const rows = await client.request<PetProfile[]>('/community/pets');
    setPets(Array.isArray(rows) ? rows : []);
  };

  useEffect(() => {
    if (!isPerson) {
      setLoading(false);
      return;
    }
    let active = true;
    void load()
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, isPerson]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const json = toPetPayload(form);
      if (editingId) {
        await client.request(`/community/pets/${editingId}`, { method: 'PATCH', json });
      } else {
        await client.request('/community/pets', { method: 'POST', json });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY);
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (pet: PetProfile) => {
    if (!window.confirm(`¿Borrar la ficha de ${pet.name}? No se puede deshacer.`)) return;
    try {
      await client.request(`/community/pets/${pet.id}`, { method: 'DELETE' });
      await load();
      toast({ title: `Borramos la ficha de ${pet.name}` });
    } catch {
      toast({ title: 'No se pudo borrar', variant: 'destructive' });
    }
  };

  if (!isPerson) {
    return (
      <PageContainer>
        <PageHeader title="Mis mascotas" />
        <EmptyState
          title="Disponible para cuentas de persona"
          description="Las organizaciones gestionan sus animales desde el módulo de animales."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Mis mascotas"
        description="La ficha de tus mascotas, solo para ti. Úsala para tener a mano sus datos cuando visites al veterinario."
        actions={
          !showForm ? (
            <Button
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY);
                setShowForm(true);
              }}
            >
              Agregar mascota
            </Button>
          ) : undefined
        }
      />

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="mb-8 grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
        >
          <label className="space-y-1 text-sm font-semibold">
            Nombre
            <Input
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            Especie
            <select
              className={selectClass}
              value={form.species}
              onChange={(event) => setForm({ ...form, species: event.target.value as PetSpecies })}
            >
              {Object.entries(PET_SPECIES_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            Raza
            <Input
              value={form.breed}
              onChange={(event) => setForm({ ...form, breed: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            Sexo
            <select
              className={selectClass}
              value={form.sex}
              onChange={(event) => setForm({ ...form, sex: event.target.value as PetSex | '' })}
            >
              <option value="">Sin indicar</option>
              {Object.entries(PET_SEX_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            Fecha aproximada de nacimiento
            <Input
              type="date"
              value={form.birthDate}
              {...dateBounds('petBirth')}
              onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            ¿Esterilizada?
            <select
              className={selectClass}
              value={form.sterilized}
              onChange={(event) =>
                setForm({ ...form, sterilized: event.target.value as PetForm['sterilized'] })
              }
            >
              <option value="">Sin indicar</option>
              <option value="yes">Sí</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold sm:col-span-2">
            Adoptada en (opcional)
            <Input
              value={form.adoptedFrom}
              placeholder="Nombre del refugio o fundación"
              onChange={(event) => setForm({ ...form, adoptedFrom: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm font-semibold sm:col-span-2">
            Notas
            <textarea
              value={form.notes}
              maxLength={1000}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              className="block min-h-24 w-full rounded-lg border border-input bg-background p-3 font-normal"
              placeholder="Alergias, alimentación, vacunas pendientes…"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving}>
              Guardar
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {loading && <Skeleton className="h-40 w-full" />}
      {!loading && pets.length === 0 && !showForm && (
        <EmptyState
          title="Aún no registras mascotas"
          description="Agrega la primera y ten sus datos siempre a mano."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pets.map((pet) => {
          const age = petAgeLabel(pet.birthDate);
          return (
            <article
              key={pet.id}
              className="space-y-1 rounded-2xl border border-border bg-card p-5"
            >
              <h3 className="text-lg font-bold">{pet.name}</h3>
              <p className="text-sm text-muted-foreground">
                {[
                  PET_SPECIES_LABELS[pet.species],
                  pet.breed,
                  pet.sex && PET_SEX_LABELS[pet.sex],
                  age,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {pet.adoptedFrom && <p className="text-sm">Adoptada en {pet.adoptedFrom}</p>}
              {pet.notes && <p className="text-sm text-foreground/80">{pet.notes}</p>}
              <div className="flex gap-3 pt-2 text-sm">
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => {
                    setEditingId(pet.id);
                    setForm(toForm(pet));
                    setShowForm(true);
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="font-semibold text-destructive hover:underline"
                  onClick={() => void onDelete(pet)}
                >
                  Borrar
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-8 text-sm">
        ¿Buscas veterinaria, peluquería o paseador?{' '}
        <Link to="/servicios" className="font-semibold text-primary hover:underline">
          Ver el directorio de servicios
        </Link>
      </p>
    </PageContainer>
  );
}
