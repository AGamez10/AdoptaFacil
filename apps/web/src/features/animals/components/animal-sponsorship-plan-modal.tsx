import { useCallback, useEffect, useState } from 'react';
import {
  type AnimalSponsorshipSettings,
  DEFAULT_SPONSORSHIP_AMOUNT_COP,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import {
  formatAmountInput,
  formatCop,
  parseAmountInput,
  sponsorshipErrorMessage,
} from '../lib/sponsorship-settings';
import styles from './animal-sponsorship-plan-modal.module.scss';

export interface AnimalSponsorshipPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  animalName: string;
}

type LoadState = 'loading' | 'ready' | 'error';

function sponsorsLabel(count: number): string {
  return count === 1 ? '1 padrino activo' : `${count} padrinos activos`;
}

/**
 * "¿Este animal necesita apadrinamiento?" — desde la ficha (`/animales`, M03).
 * Marcarlo abre el plan mensual con el aporte sugerido (50.000 COP, editable
 * aquí mismo) y muestra "Apadrinar" en el portal público; desmarcarlo deja de
 * recibir padrinos nuevos sin tocar a los actuales.
 *
 * Consume `GET|PUT|DELETE /sponsorship-plans/animal/:animalId` (idempotentes:
 * un doble clic nunca abre dos planes). Cambiar el monto con padrinos activos
 * lo resuelve la API: ellos conservan el monto que aceptaron y el nuevo aplica
 * solo a padrinos nuevos — esta ventana lo explica antes de guardar.
 */
export function AnimalSponsorshipPlanModal({
  open,
  onOpenChange,
  animalId,
  animalName,
}: AnimalSponsorshipPlanModalProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const [state, setState] = useState<LoadState>('loading');
  const [settings, setSettings] = useState<AnimalSponsorshipSettings | null>(null);
  const [amount, setAmount] = useState(formatAmountInput(DEFAULT_SPONSORSHIP_AMOUNT_COP));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = useCallback((next: AnimalSponsorshipSettings) => {
    setSettings(next);
    setAmount(formatAmountInput(next.plan?.amount ?? next.suggestedAmount));
    setAmountError(null);
  }, []);

  const load = useCallback(() => {
    let active = true;
    setState('loading');
    client
      .request<AnimalSponsorshipSettings>(`/sponsorship-plans/animal/${animalId}`)
      .then((next) => {
        if (!active) return;
        apply(next);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [client, animalId, apply]);

  useEffect(() => {
    if (!open) return;
    return load();
  }, [open, load]);

  async function save(
    request: () => Promise<AnimalSponsorshipSettings>,
    success: (next: AnimalSponsorshipSettings) => { title: string; description: string },
    failureTitle: string,
  ): Promise<void> {
    setSaving(true);
    try {
      const next = await request();
      apply(next);
      toast({ ...success(next), variant: 'success' });
    } catch (error) {
      toast({
        title: failureTitle,
        description: sponsorshipErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  function readAmount(): number | null {
    const parsed = parseAmountInput(amount);
    if (!parsed.ok) {
      setAmountError(parsed.message);
      return null;
    }
    setAmountError(null);
    return parsed.value;
  }

  function mark(): void {
    const value = readAmount();
    if (value === null) return;
    void save(
      () =>
        client.request<AnimalSponsorshipSettings>(`/sponsorship-plans/animal/${animalId}`, {
          method: 'PUT',
          json: { amount: value },
        }),
      (next) => ({
        title: 'Listo: necesita apadrinamiento',
        description: `${animalName} ya aparece con el botón "Apadrinar" en tu portal, con un aporte de ${formatCop(next.plan?.amount ?? value)} al mes.`,
      }),
      'No pudimos marcarlo',
    );
  }

  function changeAmount(): void {
    const value = readAmount();
    if (value === null) return;
    const keeping = settings?.activeSponsorsCount ?? 0;
    void save(
      () =>
        client.request<AnimalSponsorshipSettings>(`/sponsorship-plans/animal/${animalId}`, {
          method: 'PUT',
          json: { amount: value },
        }),
      () => ({
        title: 'Aporte actualizado',
        description:
          keeping > 0
            ? `Los padrinos nuevos de ${animalName} verán ${formatCop(value)} al mes. Los ${keeping} actuales siguen con el monto que aceptaron.`
            : `Los padrinos de ${animalName} verán ${formatCop(value)} al mes.`,
      }),
      'No pudimos cambiar el aporte',
    );
  }

  function unmark(): void {
    void save(
      () =>
        client.request<AnimalSponsorshipSettings>(`/sponsorship-plans/animal/${animalId}`, {
          method: 'DELETE',
        }),
      (next) => ({
        title: 'Ya no recibe padrinos nuevos',
        description:
          next.activeSponsorsCount > 0
            ? `${animalName} conserva sus ${sponsorsLabel(next.activeSponsorsCount)}. Si quieres terminar esos apadrinamientos, hazlo desde Apadrinamientos.`
            : `${animalName} ya no muestra el botón "Apadrinar" en tu portal.`,
      }),
      'No pudimos desmarcarlo',
    );
  }

  const plan = settings?.plan ?? null;
  const parsed = parseAmountInput(amount);
  const amountChanged = plan !== null && parsed.ok && parsed.value !== plan.amount;
  const suggested = formatCop(settings?.suggestedAmount ?? DEFAULT_SPONSORSHIP_AMOUNT_COP);

  const amountField = (
    <div className="space-y-1">
      <label className={styles.label} htmlFor={`sponsorship-amount-${animalId}`}>
        Aporte mensual (COP)
      </label>
      <Input
        id={`sponsorship-amount-${animalId}`}
        inputMode="numeric"
        autoComplete="off"
        value={amount}
        aria-invalid={amountError ? true : undefined}
        aria-describedby={`sponsorship-amount-help-${animalId}`}
        onChange={(e) => {
          setAmount(e.target.value);
          setAmountError(null);
        }}
      />
      <p
        id={`sponsorship-amount-help-${animalId}`}
        className={amountError ? styles['hint--error'] : styles.hint}
        role={amountError ? 'alert' : undefined}
      >
        {amountError ?? `Sugerido: ${suggested} al mes. Puedes ajustarlo para ${animalName}.`}
      </p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apadrinamiento de {animalName}</DialogTitle>
          <DialogDescription>
            Un padrino aporta cada mes para los gastos de {animalName} (comida, salud, cuidados)
            mientras encuentra hogar.
          </DialogDescription>
        </DialogHeader>

        {state === 'loading' && <Skeleton className="h-24 w-full" />}
        {state === 'error' && (
          <div className="space-y-3">
            <p className={styles['hint--error']} role="alert">
              No pudimos cargar el apadrinamiento de {animalName}. Revisa tu conexión e inténtalo de
              nuevo.
            </p>
            <Button variant="outline" onClick={() => load()}>
              Reintentar
            </Button>
          </div>
        )}

        {state === 'ready' && settings && plan && (
          <div className="space-y-3">
            <div className={styles['plan-summary']}>
              <div>
                <p className={styles['plan-summary__name']}>Necesita apadrinamiento</p>
                <p className={styles['plan-summary__amount']}>
                  {formatCop(plan.amount)} al mes ·{' '}
                  {settings.activeSponsorsCount > 0
                    ? sponsorsLabel(settings.activeSponsorsCount)
                    : 'aún sin padrinos'}
                </p>
              </div>
              <Badge variant="success">Visible en tu portal</Badge>
            </div>
            {amountField}
            {amountChanged && settings.activeSponsorsCount > 0 && (
              <p className={styles.hint}>
                El nuevo monto aplica solo a padrinos nuevos. Los{' '}
                {sponsorsLabel(settings.activeSponsorsCount)} siguen aportando lo que aceptaron.
              </p>
            )}
            <div className={styles.actions}>
              <Button disabled={saving || !amountChanged} onClick={changeAmount}>
                {saving ? 'Guardando…' : 'Guardar aporte'}
              </Button>
              <Button variant="outline" disabled={saving} onClick={unmark}>
                Ya no necesita apadrinamiento
              </Button>
            </div>
          </div>
        )}

        {state === 'ready' && settings && !plan && (
          <div className="space-y-3">
            <p className={styles.hint}>
              Al marcarlo, {animalName} aparecerá con el botón &quot;Apadrinar&quot; en tu portal
              público.
              {settings.activeSponsorsCount > 0 &&
                ` Hoy conserva ${sponsorsLabel(settings.activeSponsorsCount)} de antes.`}
            </p>
            {amountField}
            <Button disabled={saving} onClick={mark}>
              {saving ? 'Guardando…' : 'Marcar que necesita apadrinamiento'}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
