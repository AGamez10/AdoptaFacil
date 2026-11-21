import { Fragment, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicDonationOrganization } from '@adoptafacil/contracts';
import { Button, buttonVariants, cn, Skeleton } from '@adoptafacil/ui';
import {
  IconArrowRight,
  IconCheck,
  IconHeart,
  IconLock,
  IconSearch,
} from '../../landing/components/landing-icons';
import { useDonationDirectory } from '../hooks/use-donation-directory';
import {
  diligenceChips,
  donateHrefFor,
  filterDirectory,
  groupDirectory,
  initialsOf,
  levelName,
  type DirectoryGroup,
} from '../model/donation-directory-view';
import { BenefitSeal } from './benefit-seal';
import { DonorAccountBenefits } from './donor-account-benefits';
import styles from './donation-directory.module.scss';

export interface DonationDirectoryProps {
  hasSession: boolean;
  userName?: string;
}

const TRUST_POINTS = [
  { Icon: IconHeart, text: 'AdoptaFácil no cobra comisión sobre tu donación' },
  { Icon: IconLock, text: 'Pagas en Mercado Pago, directo a la cuenta de la organización' },
  { Icon: IconCheck, text: 'Recibo automático en tu correo' },
];

/**
 * `/donaciones` sin organización elegida: "¿A quién quieres ayudar?". Muestra
 * de entrada las organizaciones, primero las que más diligencia demuestran
 * (orden de la API) y agrupadas por lo que gana el donante. Quien no puede
 * recibir donaciones en línea queda al final y sin botón "Donar" que falle.
 */
export function DonationDirectory({ hasSession, userName }: DonationDirectoryProps) {
  const directory = useDonationDirectory();
  const [query, setQuery] = useState('');
  const [taxOnly, setTaxOnly] = useState(false);
  const searchId = useId();

  const items = directory.status === 'ready' ? directory.items : [];
  const filtered = useMemo(
    () => filterDirectory(items, { query, taxOnly }),
    [items, query, taxOnly],
  );
  const groups = useMemo(() => groupDirectory(filtered), [filtered]);
  const taxCount = useMemo(
    () => items.filter((o) => o.canReceiveDonations && o.donorBenefit === 'tax_certificate').length,
    [items],
  );

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.hero__inner}>
          <div className={styles.hero__copy}>
            <p className={styles.eyebrow}>Donar</p>
            <h1 className={styles.hero__title}>¿A quién quieres ayudar hoy?</h1>
            <p className={styles.hero__lead}>
              Primero te mostramos las organizaciones más formalizadas y cumplidas. Las que te dan
              certificado con beneficio tributario van adelante.
            </p>
            <ul className={styles.trust}>
              {(hasSession
                ? TRUST_POINTS
                : [...TRUST_POINTS, { Icon: IconCheck, text: 'No necesitas cuenta para donar' }]
              ).map(({ Icon, text }) => (
                <li key={text} className={styles.trust__item}>
                  <span className={styles.trust__icon} aria-hidden>
                    <Icon width={16} height={16} />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <aside className={cn(styles.hero__aside, !hasSession && styles['hero__aside--desktop'])}>
            {hasSession ? (
              <div className={styles.welcome} data-testid="donation-directory-welcome">
                <p className={styles.welcome__title}>
                  {userName ? `Hola, ${userName.split(' ')[0]}` : 'Hola de nuevo'}
                </p>
                <p className={styles.welcome__text}>
                  Tus donaciones, recibos y certificados quedan guardados en tu cuenta.
                </p>
                <Link
                  to="/mis-donaciones"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                >
                  Ver mis donaciones
                </Link>
              </div>
            ) : (
              <DonorAccountBenefits />
            )}
          </aside>
        </div>
      </section>

      <div className={styles.body}>
        <div className={styles.toolbar} role="search">
          <label htmlFor={searchId} className={styles['sr-only']}>
            Buscar organización por nombre o ciudad
          </label>
          <div className={styles.search}>
            <IconSearch width={18} height={18} className={styles.search__icon} />
            <input
              id={searchId}
              type="search"
              className={styles.search__input}
              placeholder="Busca por nombre o ciudad"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="donation-directory-search"
            />
          </div>
          <button
            type="button"
            className={cn(styles.toggle, taxOnly && styles['toggle--on'])}
            aria-pressed={taxOnly}
            onClick={() => setTaxOnly((v) => !v)}
            disabled={taxCount === 0}
            data-testid="donation-directory-tax-only"
          >
            Solo con beneficio tributario
            <span className={styles.toggle__count}>{taxCount}</span>
          </button>
        </div>

        <details className={styles.howto}>
          <summary className={styles.howto__summary}>¿Cómo ordenamos a las organizaciones?</summary>
          <div className={styles.howto__content}>
            <p>
              Premiamos la diligencia. Primero van las que pueden recibir tu donación hoy, y entre
              ellas, las más formalizadas: ESAL con Régimen Tributario Especial vigente, ESAL,
              formalizadas, en proceso e informales. AdoptaFácil revisa los documentos de cada
              nivel.
            </p>
            <p>
              Dentro de cada nivel suben las que tienen sus documentos al día, publican en qué usan
              las donaciones en su libro de transparencia, tienen buenas reseñas y campañas activas.
              Nadie paga por aparecer primero.
            </p>
          </div>
        </details>

        {directory.status === 'loading' && (
          <div className={styles.grid} aria-busy="true" data-testid="donation-directory-loading">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className={styles.skeleton} />
            ))}
          </div>
        )}

        {directory.status === 'error' && (
          <div className={styles.notice} role="alert" data-testid="donation-directory-error">
            <p className={styles.notice__title}>No pudimos cargar las organizaciones</p>
            <p className={styles.notice__text}>
              Revisa tu conexión e inténtalo de nuevo. No se te ha cobrado nada.
            </p>
            <Button onClick={directory.retry}>Intentar de nuevo</Button>
          </div>
        )}

        {directory.status === 'ready' && items.length === 0 && (
          <div className={styles.notice} data-testid="donation-directory-empty">
            <p className={styles.notice__title}>Muy pronto verás aquí a las organizaciones</p>
            <p className={styles.notice__text}>
              Mientras tanto puedes apoyar una campaña o adoptar.
            </p>
            <Link to="/campanas" className={cn(buttonVariants())}>
              Ver campañas
            </Link>
          </div>
        )}

        {directory.status === 'ready' && items.length > 0 && groups.length === 0 && (
          <div className={styles.notice} data-testid="donation-directory-no-results">
            <p className={styles.notice__title}>Ninguna organización coincide</p>
            <p className={styles.notice__text}>Prueba con otro nombre o ciudad.</p>
            <Button
              variant="outline"
              onClick={() => {
                setQuery('');
                setTaxOnly(false);
              }}
            >
              Ver todas
            </Button>
          </div>
        )}

        {groups.map((group, index) => (
          <Fragment key={group.key}>
            <DirectoryGroupSection group={group} />
            {/* Celular: las organizaciones primero; la invitación a crear
                cuenta va después del primer grupo (en escritorio, al lado). */}
            {index === 0 && !hasSession && (
              <div className={styles['account-mobile']}>
                <DonorAccountBenefits />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function DirectoryGroupSection({ group }: { group: DirectoryGroup }) {
  const headingId = `donation-group-${group.key}`;
  return (
    <section
      className={cn(styles.group, group.key === 'unavailable' && styles['group--muted'])}
      aria-labelledby={headingId}
      data-testid={`donation-group-${group.key}`}
    >
      <header className={styles.group__header}>
        <h2 id={headingId} className={styles.group__title}>
          {group.title}
          <span className={styles.group__count}>{group.items.length}</span>
        </h2>
        <p className={styles.group__desc}>{group.description}</p>
      </header>
      <ul className={styles.grid}>
        {group.items.map((org) => (
          <li key={org.id}>
            <OrganizationCard org={org} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function OrganizationCard({ org }: { org: PublicDonationOrganization }) {
  const chips = diligenceChips(org);
  const portal = `/o/${encodeURIComponent(org.slug)}`;
  return (
    <article
      className={cn(styles.card, !org.canReceiveDonations && styles['card--muted'])}
      data-testid="donation-directory-card"
      data-org-id={org.id}
    >
      <div className={styles.card__head}>
        {org.logoUrl ? (
          <img src={org.logoUrl} alt="" className={styles.card__logo} loading="lazy" />
        ) : (
          <span className={cn(styles.card__logo, styles['card__logo--initials'])} aria-hidden>
            {initialsOf(org.name)}
          </span>
        )}
        <div className={styles.card__id}>
          <h3 className={styles.card__name}>{org.name}</h3>
          <p className={styles.card__meta}>
            {[org.city, levelName(org)].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {org.canReceiveDonations ? (
        <BenefitSeal benefit={org.donorBenefit} />
      ) : (
        <p className={styles.card__pending}>Todavía no recibe donaciones en línea.</p>
      )}

      {chips.length > 0 && (
        <ul className={styles.chips} aria-label="Señales de diligencia">
          {chips.map((chip) => (
            <li key={chip.key} className={styles.chip}>
              {chip.key !== 'reviews' && <IconCheck width={12} height={12} aria-hidden />}
              {chip.label}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.card__actions}>
        {org.canReceiveDonations ? (
          <>
            <Link
              to={donateHrefFor(org)}
              className={cn(buttonVariants(), styles.card__donate)}
              data-testid="donation-directory-donate"
              aria-label={`Donar a ${org.name}`}
            >
              Donar
            </Link>
            <Link to={portal} className={styles.card__portal}>
              Conocerla
            </Link>
          </>
        ) : (
          <Link
            to={portal}
            className={cn(buttonVariants({ variant: 'outline' }), styles.card__donate)}
            data-testid="donation-directory-portal"
          >
            Otras formas de ayudar
            <IconArrowRight width={16} height={16} aria-hidden />
          </Link>
        )}
      </div>
    </article>
  );
}
