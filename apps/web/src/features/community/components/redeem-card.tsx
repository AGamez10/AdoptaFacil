import { useState, type FormEvent } from 'react';
import { normalizeBenefitPassCode, type BenefitRedemption } from '@adoptafacil/contracts';
import { Button } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { monthLabel, typingPassCode } from '../model/business-view';

type Outcome = { kind: 'ok'; data: BenefitRedemption } | { kind: 'error'; message: string } | null;

/**
 * "Validar un código": quien adoptó muestra su código y el negocio lo escribe
 * aquí. Muestra el beneficio, el animal y el mes de la adopción, nunca quién
 * adoptó. Un código se usa una sola vez.
 */
export function RedeemCard({ onRedeemed }: { onRedeemed?: () => void }) {
  const client = useApiClient();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const ready = normalizeBenefitPassCode(code).length === 8;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setOutcome(null);
    try {
      const data = await client.request<BenefitRedemption>('/community/business/redeem', {
        method: 'POST',
        json: { code: normalizeBenefitPassCode(code) },
      });
      setOutcome({ kind: 'ok', data });
      if (data.result === 'redeemed') {
        setCode('');
        onRedeemed?.();
      }
    } catch (error) {
      const status = (error as { status?: number }).status;
      setOutcome({
        kind: 'error',
        message:
          status === 404
            ? 'Ese código no corresponde a un beneficio de tu negocio. Revisa que esté bien escrito.'
            : status === 429
              ? 'Hiciste muchos intentos seguidos. Espera un rato y vuelve a intentarlo.'
              : 'No pudimos validar el código. Inténtalo de nuevo.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="redeem-title"
      className="rounded-2xl border-2 border-brand-teal/40 bg-card p-5"
      data-testid="redeem-card"
    >
      <h2 id="redeem-title" className="text-lg font-bold">
        Validar un código
      </h2>
      <p className="text-sm text-muted-foreground">
        Cuando alguien que adoptó te muestre su código, escríbelo aquí.
      </p>
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="redeem-code" className="sr-only">
          Código del beneficio
        </label>
        <input
          id="redeem-code"
          value={code}
          onChange={(event) => {
            setCode(typingPassCode(event.target.value));
            setOutcome(null);
          }}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX"
          className="min-w-0 flex-1 rounded-xl border-2 border-input bg-background px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.3em] outline-none focus:border-primary sm:text-left"
        />
        <Button type="submit" disabled={!ready || busy} className="h-auto py-3">
          {busy ? 'Validando…' : 'Validar'}
        </Button>
      </form>

      {outcome?.kind === 'ok' && (
        <div
          role="status"
          className={
            outcome.data.result === 'redeemed'
              ? 'mt-4 rounded-xl bg-brand-teal/10 p-4'
              : 'mt-4 rounded-xl bg-brand-gold/20 p-4'
          }
        >
          <p className="font-bold">
            {outcome.data.result === 'redeemed'
              ? '✓ Código válido. Entrega el beneficio.'
              : 'Este código ya se usó.'}
          </p>
          <p className="mt-1 text-sm">
            <strong>{outcome.data.benefitTitle}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Para {outcome.data.animalName}, adoptado en {monthLabel(outcome.data.adoptedMonth)}.
          </p>
        </div>
      )}
      {outcome?.kind === 'error' && (
        <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          {outcome.message}
        </p>
      )}
    </section>
  );
}
