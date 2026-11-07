import { useState } from 'react';
import { Button, Input } from '@adoptafacil/ui';
import { formatDayEs } from '@adoptafacil/contracts';

export interface SessionDaysPickerProps {
  id: string;
  /** Días habilitados (`AAAA-MM-DD`, ordenados). */
  value: string[];
  onChange: (days: string[]) => void;
  /** Fechas de la convocatoria (`AAAA-MM-DD`); sin ellas no se puede elegir. */
  start: string;
  end: string;
}

/** Máximo de días que el atajo "todos los días" agrega de una vez. */
const MAX_RANGE_SHORTCUT = 62;

function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  while (out.length <= MAX_RANGE_SHORTCUT) {
    const day = cursor.toISOString().slice(0, 10);
    if (day > end) break;
    out.push(day);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Días de jornada de una convocatoria de voluntariado: la organización elige
 * los días calendario en los que se trabaja, y SOLO en esos días el voluntario
 * puede registrar horas (la API aplica la misma regla). Siempre dentro de las
 * fechas de la convocatoria.
 */
export function SessionDaysPicker({ id, value, onChange, start, end }: SessionDaysPickerProps) {
  const [pending, setPending] = useState('');
  const ready = Boolean(start && end && end >= start);
  const inRange = pending !== '' && pending >= start && pending <= end;
  const rangeDays = ready ? daysBetween(start, end) : [];

  const add = (): void => {
    if (!inRange || value.includes(pending)) return;
    onChange([...value, pending].sort());
    setPending('');
  };

  return (
    <div className="space-y-2" data-testid="session-days-picker">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        Días de jornada
      </label>
      <p className="text-xs text-muted-foreground">
        Elige los días en que se hace la jornada. Los voluntarios solo podrán registrar horas en
        esos días, y nunca antes de que ocurran.
      </p>
      {!ready ? (
        <p className="text-xs text-muted-foreground">
          Primero indica la fecha de inicio y la de fin.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={id}
              type="date"
              className="h-9 w-48"
              min={start}
              max={end}
              value={pending}
              onChange={(e) => setPending(e.target.value)}
            />
            <Button type="button" size="sm" variant="outline" disabled={!inRange} onClick={add}>
              Agregar día
            </Button>
            {rangeDays.length <= MAX_RANGE_SHORTCUT && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(rangeDays)}>
                Todos los días ({rangeDays.length})
              </Button>
            )}
          </div>
          {value.length === 0 ? (
            <p className="text-xs font-medium text-amber-700">Aún no has habilitado ningún día.</p>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label="Días habilitados">
              {value.map((day) => {
                const outside = day < start || day > end;
                return (
                  <li
                    key={day}
                    className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                      outside ? 'border-red-300 bg-red-50 text-red-800' : 'border-border bg-muted'
                    }`}
                  >
                    {formatDayEs(day)}
                    {outside && ' (fuera de las fechas)'}
                    <button
                      type="button"
                      className="ml-1 rounded-full px-1 text-muted-foreground hover:text-foreground"
                      aria-label={`Quitar ${formatDayEs(day)}`}
                      onClick={() => onChange(value.filter((d) => d !== day))}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
