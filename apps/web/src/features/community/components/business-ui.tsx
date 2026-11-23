import type { ReactNode } from 'react';
import { cn } from '@adoptafacil/ui';
import { formatBenefitPassCode } from '@adoptafacil/contracts';

/**
 * Piezas visuales de Negocios aliados: el sello, el "pase" con código que
 * muestra quien adoptó y la cifra de impacto. Solo tokens de marca.
 */

/** Sello circular "Aliado de AdoptaFácil" (lo otorga la plataforma). */
export function AllySeal({
  size = 'md',
  muted = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  muted?: boolean;
}) {
  const dims = { sm: 'h-14 w-14 text-[8px]', md: 'h-24 w-24 text-[10px]', lg: 'h-32 w-32 text-xs' }[
    size
  ];
  return (
    <span
      role="img"
      aria-label={muted ? 'Sello de aliado, aún por ganar' : 'Sello Aliado de AdoptaFácil'}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full border-4 border-dashed font-extrabold uppercase leading-tight tracking-wide',
        dims,
        muted
          ? 'border-border bg-muted text-muted-foreground'
          : 'border-brand-navy/30 bg-brand-gold text-brand-navy shadow-md',
      )}
    >
      <span className="flex flex-col items-center px-2 text-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="mb-0.5 h-1/4 w-1/4"
          fill="currentColor"
        >
          <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.2 5 6.7 5c2 0 3.4 1.1 4.3 2.4h2C13.9 6.1 15.3 5 17.3 5c3.5 0 5.5 3.6 4.2 6.8C19.5 16.4 12 21 12 21z" />
        </svg>
        Aliado
        {size !== 'sm' && (
          <span className="font-semibold normal-case tracking-normal">de AdoptaFácil</span>
        )}
      </span>
    </span>
  );
}

/** Un "pase" con forma de boleto: el código que quien adoptó muestra en el negocio. */
export function PassTicket({
  code,
  title,
  business,
  footer,
  redeemed = false,
  className,
}: {
  code: string;
  title: string;
  business: string;
  footer?: ReactNode;
  redeemed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex overflow-hidden rounded-2xl border border-border bg-card shadow-sm',
        redeemed && 'opacity-80',
        className,
      )}
      data-testid="pass-ticket"
    >
      <div
        className="flex w-3 shrink-0 flex-col justify-between bg-brand-teal"
        aria-hidden="true"
      />
      <div className="flex-1 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand-teal-dark">
          Beneficio por adoptar · {business}
        </p>
        <p className="mt-1 font-bold leading-snug">{title}</p>
        {footer && <div className="mt-2 text-xs text-muted-foreground">{footer}</div>}
      </div>
      <div className="relative flex w-36 shrink-0 flex-col items-center justify-center border-l-2 border-dashed border-border bg-muted/40 px-2 py-4 sm:w-44">
        <span
          aria-hidden="true"
          className="absolute -top-3 -left-3 h-6 w-6 rounded-full border border-border bg-background"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-3 -left-3 h-6 w-6 rounded-full border border-border bg-background"
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {redeemed ? 'Usado' : 'Tu código'}
        </span>
        <span
          className={cn(
            'mt-1 font-mono text-lg font-extrabold tracking-widest sm:text-xl',
            redeemed && 'line-through decoration-2',
          )}
        >
          {formatBenefitPassCode(code)}
        </span>
      </div>
    </div>
  );
}

/** Cifra de impacto: número grande y qué significa. */
export function ImpactStat({
  value,
  label,
  hint,
  tone = 'teal',
}: {
  value: number;
  label: string;
  hint?: string;
  tone?: 'teal' | 'gold' | 'coral' | 'navy';
}) {
  const toneClass = {
    teal: 'bg-brand-teal/10 text-brand-teal-dark',
    gold: 'bg-brand-gold/20 text-brand-navy',
    coral: 'bg-brand-coral/15 text-brand-navy',
    navy: 'bg-brand-navy/10 text-brand-navy',
  }[tone];
  return (
    <div className={cn('rounded-2xl p-4', toneClass)}>
      <p className="text-3xl font-extrabold tabular-nums">{value}</p>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
