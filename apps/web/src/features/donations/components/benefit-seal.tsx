import type { DonorBenefit } from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { IconDocument, IconShield } from '../../landing/components/landing-icons';
import { BENEFIT_SEALS } from '../model/donation-directory-view';
import styles from './benefit-seal.module.scss';

export interface BenefitSealProps {
  benefit: DonorBenefit;
  /** Oculta la explicación (solo el título del sello). */
  compact?: boolean;
  className?: string;
}

/** Sello de "qué obtienes al donar": certificado tributario, contable o comprobante. */
export function BenefitSeal({ benefit, compact = false, className }: BenefitSealProps) {
  const seal = BENEFIT_SEALS[benefit];
  const Icon = benefit === 'receipt' ? IconDocument : IconShield;
  return (
    <div
      className={cn(styles.seal, styles[`seal--${seal.tone}`], className)}
      data-testid={`benefit-seal-${benefit}`}
    >
      <span className={styles.seal__icon} aria-hidden>
        <Icon width={18} height={18} />
      </span>
      <span className={styles.seal__text}>
        <span className={styles.seal__title}>{seal.title}</span>
        {!compact && <span className={styles.seal__detail}>{seal.detail}</span>}
      </span>
    </div>
  );
}
