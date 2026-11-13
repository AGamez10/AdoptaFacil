import { useState } from 'react';
import {
  type VolunteerOpportunity,
  type VolunteerOpportunityChangeResult,
  VolunteerOpportunityStatus,
} from '@adoptafacil/contracts';
import { Button, Input, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { SessionDaysPicker } from './session-days-picker';
import { firstFormProblem } from '../../../lib/form-checks';

export interface OpportunityScheduleActionsProps {
  opportunity: VolunteerOpportunity;
  onChanged: (opportunity: VolunteerOpportunity) => void;
}

type Mode = 'idle' | 'reschedule' | 'cancel';

const plural = (n: number) => (n === 1 ? '1 persona inscrita' : `${n} personas inscritas`);

/**
 * Reprogramar o cancelar una jornada ya publicada. Una jornada no se borra:
 * sus inscripciones y su historial deben sobrevivir. Reprogramar cambia
 * fechas/días y avisa a cada persona inscrita; cancelar exige un motivo, cierra
 * las inscripciones abiertas y también avisa. La API impide dejar por fuera
 * horas ya registradas (y cancelar una jornada que ya tiene horas).
 */
export function OpportunityScheduleActions({
  opportunity,
  onChanged,
}: OpportunityScheduleActionsProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('idle');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [days, setDays] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  if (opportunity.status === VolunteerOpportunityStatus.Cancelled) {
    return (
      <div
        className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        data-testid="opportunity-cancelled"
      >
        <p className="font-medium text-destructive">Jornada cancelada</p>
        {opportunity.cancellationReason && (
          <p className="text-muted-foreground">Motivo: {opportunity.cancellationReason}</p>
        )}
      </div>
    );
  }

  const openReschedule = (): void => {
    setStart(opportunity.startDate.slice(0, 10));
    setEnd(opportunity.endDate.slice(0, 10));
    setDays(opportunity.sessionDates ?? []);
    setReason('');
    setMode('reschedule');
  };

  const openCancel = (): void => {
    setReason('');
    setMode('cancel');
  };

  const reschedule = async (): Promise<void> => {
    const problem = firstFormProblem([
      {
        ok: Boolean(start),
        title: 'Falta la fecha de inicio',
        message: 'Elige cuándo empieza la jornada.',
      },
      {
        ok: Boolean(end),
        title: 'Falta la fecha de fin',
        message: 'Elige cuándo termina la jornada.',
      },
      {
        ok: !start || !end || end > start,
        title: 'Revisa las fechas',
        message: 'La fecha de fin debe ser posterior a la de inicio.',
      },
      {
        ok: days.every((d) => d >= start && d <= end),
        title: 'Días por fuera',
        message: 'Todos los días de jornada deben quedar dentro de las nuevas fechas.',
      },
    ]);
    if (problem) {
      toast({ ...problem, variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const updated = await client.request<VolunteerOpportunity & { notifiedVolunteers?: number }>(
        `/volunteer-opportunities/${encodeURIComponent(opportunity.id)}`,
        {
          method: 'PATCH',
          json: {
            // Solo las fechas que cambian: una jornada en curso conserva su
            // inicio (ya pasado) sin que la regla de "no en el pasado" la frene.
            ...(start !== opportunity.startDate.slice(0, 10)
              ? { startDate: new Date(start).toISOString() }
              : {}),
            ...(end !== opportunity.endDate.slice(0, 10)
              ? { endDate: new Date(end).toISOString() }
              : {}),
            sessionDates: days,
            ...(reason.trim() ? { rescheduleReason: reason.trim() } : {}),
          },
        },
      );
      const { notifiedVolunteers = 0, ...next } = updated;
      onChanged(next);
      setMode('idle');
      toast({
        title: 'Jornada reprogramada',
        description:
          notifiedVolunteers > 0
            ? `Avisamos por correo a ${plural(notifiedVolunteers)}.`
            : 'Aún no hay personas inscritas a quienes avisar.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo reprogramar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (): Promise<void> => {
    if (reason.trim().length < 5) {
      toast({
        title: 'Falta el motivo',
        description: 'Cuéntales a los inscritos por qué se cancela (al menos 5 caracteres).',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const result = await client.request<VolunteerOpportunityChangeResult>(
        `/volunteer-opportunities/${encodeURIComponent(opportunity.id)}/cancel`,
        { method: 'POST', json: { reason: reason.trim() } },
      );
      onChanged(result.opportunity);
      setMode('idle');
      toast({
        title: 'Jornada cancelada',
        description:
          result.notifiedVolunteers > 0
            ? `Avisamos por correo a ${plural(result.notifiedVolunteers)} y cerramos sus inscripciones.`
            : 'No había personas inscritas.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo cancelar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-3" data-testid="opportunity-schedule-actions">
      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={openReschedule}>
            Reprogramar jornada
          </Button>
          <Button size="sm" variant="outline" onClick={openCancel}>
            Cancelar jornada
          </Button>
        </div>
      )}

      {mode === 'reschedule' && (
        <div className="space-y-3 rounded-md border p-3 text-foreground">
          <p className="font-medium">Reprogramar jornada</p>
          <p className="text-xs text-muted-foreground">
            Cambia las fechas o los días (por ejemplo, al siguiente fin de semana). Las personas
            inscritas reciben un correo con la nueva fecha. Los días que ya tienen horas registradas
            deben seguir en la jornada.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span>Inicio</span>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="space-y-1 text-xs">
              <span>Fin</span>
              <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <SessionDaysPicker
            id="vo-reschedule-days"
            value={days}
            onChange={setDays}
            start={start}
            end={end}
          />
          <Input
            placeholder="Motivo para los inscritos (opcional): p. ej. pronóstico de lluvia"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Motivo de la reprogramación"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={() => void reschedule()}>
              {saving ? 'Guardando…' : 'Guardar y avisar'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode('idle')}>
              Volver
            </Button>
          </div>
        </div>
      )}

      {mode === 'cancel' && (
        <div className="space-y-3 rounded-md border border-destructive/40 p-3 text-foreground">
          <p className="font-medium">Cancelar jornada</p>
          <p className="text-xs text-muted-foreground">
            La jornada no se borra: queda cancelada, sale del listado público, se cierran las
            inscripciones abiertas y cada persona recibe un correo con el motivo. Si solo cambia la
            fecha, mejor reprográmala. Si ya hay horas registradas no se puede cancelar.
          </p>
          <Input
            placeholder="Motivo (obligatorio): p. ej. no conseguimos el transporte"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Motivo de la cancelación"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="dark" disabled={saving} onClick={() => void cancel()}>
              {saving ? 'Cancelando…' : 'Cancelar y avisar'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode('idle')}>
              Volver
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
