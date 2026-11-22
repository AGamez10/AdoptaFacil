import { useState } from 'react';
import {
  type AnimalCareLog,
  type AnimalSex,
  CARE_LOG_KIND_LABELS,
  CARE_LOG_KINDS,
  type CareAnimalCard,
  type CareLogKind,
  type ComputedAge,
} from '@adoptafacil/contracts';
import { Badge, Button, Card, CardContent, Skeleton, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { addCareLog, fetchMyCareLogs } from '../api/team-api';
import { CareLogList } from './care-log-list';

const SEX_LABELS: Record<AnimalSex, string> = {
  male: 'macho',
  female: 'hembra',
  unknown: 'sexo desconocido',
};

const SPECIES_LABELS: Record<string, string> = { dog: 'Perro', cat: 'Gato', other: 'Otro' };

function ageLabel(age?: ComputedAge): string | undefined {
  if (!age) return undefined;
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} años`);
  if (age.months > 0) parts.push(`${age.months} m`);
  const text = parts.join(' ') || '0 m';
  return age.approximate ? `~${text}` : text;
}

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/**
 * Un animal a cargo de la persona: su ficha básica (sin adoptantes, donantes ni
 * historia clínica) y el registro de sus cuidados.
 */
export function MyAnimalCard({ animal }: { animal: CareAnimalCard }) {
  const client = useApiClient();
  const { toast } = useToast();
  const [kind, setKind] = useState<CareLogKind>('walk');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<AnimalCareLog[] | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const subline = [
    SPECIES_LABELS[animal.species] ?? animal.species,
    animal.breed,
    SEX_LABELS[animal.sex],
    ageLabel(animal.computedAge),
  ]
    .filter(Boolean)
    .join(' · ');

  async function loadLogs() {
    try {
      setLogs(await fetchMyCareLogs(client, animal.id));
    } catch {
      setLogs([]);
    }
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    if (kind === 'observation' && !note.trim()) {
      toast({ title: 'Escribe lo que observaste', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await addCareLog(client, animal.id, { kind, ...(note.trim() ? { note: note.trim() } : {}) });
      toast({ title: `${CARE_LOG_KIND_LABELS[kind]} registrado`, variant: 'success' });
      setNote('');
      if (showLogs) await loadLogs();
    } catch (error) {
      toast({
        title: 'No se pudo registrar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card data-testid={`care-animal-${animal.id}`}>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start gap-3">
          {animal.photoUrl ? (
            <img
              src={animal.photoUrl}
              alt={`Foto de ${animal.name}`}
              className="h-16 w-16 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div aria-hidden className="h-16 w-16 shrink-0 rounded-lg bg-muted" />
          )}
          <div className="min-w-0 space-y-1">
            <h3 className="font-semibold">{animal.name}</h3>
            <p className="text-sm text-muted-foreground">{subline}</p>
            {animal.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {animal.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        {animal.description && <p className="text-sm">{animal.description}</p>}

        <form className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]" onSubmit={register}>
          <select
            aria-label={`Cuidado de ${animal.name}`}
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as CareLogKind)}
          >
            {CARE_LOG_KINDS.map((k) => (
              <option key={k} value={k}>
                {CARE_LOG_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <input
            aria-label="Nota del cuidado"
            className={selectClass}
            maxLength={1000}
            placeholder={kind === 'observation' ? 'Qué observaste (obligatorio)' : 'Nota opcional'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Registrar'}
          </Button>
        </form>

        <button
          type="button"
          className="text-sm text-primary underline-offset-4 hover:underline"
          onClick={() => {
            const next = !showLogs;
            setShowLogs(next);
            if (next) void loadLogs();
          }}
        >
          {showLogs ? 'Ocultar cuidados registrados' : 'Ver cuidados registrados'}
        </button>
        {showLogs && (logs ? <CareLogList logs={logs} /> : <Skeleton className="h-16 w-full" />)}
      </CardContent>
    </Card>
  );
}
