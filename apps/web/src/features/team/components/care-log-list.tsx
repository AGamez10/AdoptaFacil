import { useEffect, useState } from 'react';
import { type AnimalCareLog, CARE_LOG_KIND_LABELS } from '@adoptafacil/contracts';
import { Skeleton } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { fetchAnimalCareLogs } from '../api/team-api';

const formatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

export function formatCareMoment(iso: string): string {
  return formatter.format(new Date(iso));
}

/** Lista de cuidados registrados (paseos, alimentación, limpieza, observaciones). */
export function CareLogList({ logs }: { logs: AnimalCareLog[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">Aún no hay cuidados registrados.</p>;
  }
  return (
    <ul className="divide-y rounded-md border" aria-label="Cuidados registrados">
      {logs.map((log) => (
        <li key={log.id} className="space-y-0.5 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{CARE_LOG_KIND_LABELS[log.kind]}</span>
            <span className="text-xs text-muted-foreground">
              {formatCareMoment(log.occurredAt)} · {log.authorName}
            </span>
          </div>
          {log.note && <p className="text-muted-foreground">{log.note}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Pestaña "Cuidados" de la ficha: lo que registró el equipo que cuida al animal. */
export function AnimalCareLogSection({ animalId }: { animalId: string }) {
  const client = useApiClient();
  const [logs, setLogs] = useState<AnimalCareLog[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLogs(null);
    setFailed(false);
    fetchAnimalCareLogs(client, animalId)
      .then((items) => {
        if (active) setLogs(items);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [client, animalId]);

  if (failed) {
    return <p className="text-sm text-destructive">No se pudieron cargar los cuidados.</p>;
  }
  if (!logs) return <Skeleton className="h-24 w-full" />;
  return (
    <div className="space-y-2 pt-2">
      <p className="text-sm text-muted-foreground">
        Lo que registran las personas que tienen a este animal a su cargo.
      </p>
      <CareLogList logs={logs} />
    </div>
  );
}
