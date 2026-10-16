import { Link } from 'react-router-dom';
import { CampaignCategory, type CampaignPublic } from '@adoptafacil/contracts';
import { Badge, cn } from '@adoptafacil/ui';
import {
  CATEGORY_LABELS,
  formatBogota,
  formatCop,
  progressPercent,
  publicCampaignDetailHref,
} from '../model/campaigns-view';
import { CampaignProgress } from './campaign-progress';
import styles from './campaign-card.module.scss';

export interface CampaignCardProps {
  campaign: CampaignPublic;
  /** `brand` = superficies de AdoptaFácil (landing, /campanas) con la marca v3.
   *  Los portales de cada organización siguen usando la tarjeta por defecto. */
  variant?: 'default' | 'brand';
}

const CATEGORY_TONE: Record<CampaignPublic['category'], string> = {
  [CampaignCategory.Medications]: 'mint',
  [CampaignCategory.Food]: 'sun',
  [CampaignCategory.Surgeries]: 'coral',
  [CampaignCategory.Sterilizations]: 'sky',
  [CampaignCategory.Infrastructure]: 'sun',
  [CampaignCategory.Emergencies]: 'coral',
};

/**
 * Tarjeta pública de una campaña activa (§M14/M06, rediseño "editorial"
 * T-D06). Muestra sólo columnas públicas (título, organización, categoría
 * con label legible, avance —hoy 0—, deadline) y enlaza al detalle público;
 * pasa la campaña por nav-state para evitar refetch. Simple a propósito
 * (feedback directo: sin cabecera decorativa "de dashboard").
 */
export function CampaignCard({ campaign, variant = 'default' }: CampaignCardProps) {
  const href = publicCampaignDetailHref(campaign.id);
  if (variant === 'brand') return <BrandCampaignCard campaign={campaign} href={href} />;
  return (
    <article className={styles.card} data-testid="campaign-card">
      <div className={styles.meta}>
        <Badge variant="secondary">{CATEGORY_LABELS[campaign.category]}</Badge>
        <span className="text-xs text-muted-foreground">{campaign.organizationName}</span>
      </div>
      <Link
        to={href}
        state={{ campaign }}
        className={`${styles.title} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        {campaign.title}
      </Link>
      <CampaignProgress
        raisedAmount={campaign.raisedAmount}
        goalAmount={campaign.goalAmount}
        progress={campaign.progress}
      />
      <p className={styles.deadline}>Vence {formatBogota(campaign.deadline)}</p>
      <Link to={href} state={{ campaign }} className={styles.cta}>
        Quiero ayudar
      </Link>
    </article>
  );
}

function BrandCampaignCard({ campaign, href }: { campaign: CampaignPublic; href: string }) {
  const pct = progressPercent(campaign.progress);
  return (
    <article
      className={cn(styles.card, styles['card--brand'])}
      data-tone={CATEGORY_TONE[campaign.category] ?? 'mint'}
      data-testid="campaign-card"
    >
      <div className={styles.brand__top}>
        <span className={styles.brand__tag}>{CATEGORY_LABELS[campaign.category]}</span>
        <span className={styles.brand__org}>{campaign.organizationName}</span>
      </div>
      <Link to={href} state={{ campaign }} className={styles.brand__title}>
        {campaign.title}
      </Link>
      {campaign.description && <p className={styles.brand__text}>{campaign.description}</p>}
      <div className={styles.brand__progress} data-testid="campaign-progress">
        <div
          className={styles.brand__bar}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div style={{ width: `${pct}%` }} />
        </div>
        <p>
          <strong>{formatCop(campaign.raisedAmount)}</strong> de {formatCop(campaign.goalAmount)} ·{' '}
          {pct}%
        </p>
      </div>
      <div className={styles.brand__foot}>
        <span className={styles.deadline}>Vence {formatBogota(campaign.deadline)}</span>
        <Link to={href} state={{ campaign }} className={styles.brand__cta}>
          Quiero ayudar
        </Link>
      </div>
    </article>
  );
}
