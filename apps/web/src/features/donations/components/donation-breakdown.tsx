import { cn } from '@adoptafacil/ui';
import { buildDonationBreakdown, formatCop } from '../model/donation-breakdown-view';
import styles from './donation-breakdown.module.scss';

export interface DonationBreakdownProps {
  intendedAmount: number;
  organizationName: string;
}

/**
 * Lo que paga la Persona, que se muestra ANTES de pagar (§M05, P1). Las cifras
 * vienen ÍNTEGRAS de `computeBreakdown` (vía el view-model). AdoptaFácil no
 * cobra comisión y no inventa la tarifa de Mercado Pago: esa la fija Mercado
 * Pago sobre la cuenta de la organización.
 */
export function DonationBreakdown({ intendedAmount, organizationName }: DonationBreakdownProps) {
  const { lines } = buildDonationBreakdown(intendedAmount);
  return (
    <dl className={styles.breakdown} data-testid="donation-breakdown">
      {lines.map((line) => (
        <div
          key={line.key}
          className={cn(
            styles.breakdown__line,
            line.emphasis && styles['breakdown__line--emphasis'],
          )}
        >
          <dt>{line.label}</dt>
          <dd data-testid={`breakdown-${line.key}`}>{formatCop(line.amount)}</dd>
        </div>
      ))}
      <p className={styles.breakdown__note} data-testid="breakdown-note">
        AdoptaFácil no cobra comisión por tu donación. Tu pago va directo a la cuenta de Mercado
        Pago de {organizationName}; Mercado Pago le descuenta a la organización su propia tarifa.
      </p>
    </dl>
  );
}
