import { useEffect, useState } from 'react';
import type { CreatePublicReviewInput, PublicReview, Review } from '@adoptafacil/contracts';
import { Skeleton } from '@adoptafacil/ui';
import { fetchPublicReviews } from '../api/public-reviews';
import { RegisterReviewDialog, type ReviewMember } from './register-review-dialog';
import { ReviewCarousel } from './review-carousel';
import catalogStyles from '../styles/public-catalog.module.scss';
import styles from '../styles/public-reviews.module.scss';

const HEADING_ID = 'portal-section-reviews';
const PAGE_SIZE = 30;

type SectionState = 'loading' | 'ready' | 'error';

export interface PortalReviewsSectionProps {
  slug: string;
  /** Hay sesión de AdoptaFácil: la reseña lleva el sello de comunidad. */
  member?: ReviewMember;
  /** Envío con el token de la sesión (solo junto a `member`). */
  submitAsMember?: (slug: string, input: CreatePublicReviewInput) => Promise<Review>;
}

/**
 * Sección "Reseñas" del portal público (§M14/M12, S7-b — pedido directo del
 * cliente): reseñas sin cuenta obligatoria (nombre opcional; con sesión
 * llevan el sello "Miembro de la comunidad"), visibles debajo de "Nosotros", en
 * fila (carrusel condicional, `ReviewCarousel`) con el botón "Registrar
 * reseña" al final. Mismo patrón EXACTO que `PortalCampaignsSection`: fetch
 * por slug, `.items` ya normalizado a `[]`, estado vacío explícito.
 */
export function PortalReviewsSection({ slug, member, submitAsMember }: PortalReviewsSectionProps) {
  const [items, setItems] = useState<PublicReview[]>([]);
  const [state, setState] = useState<SectionState>('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    fetchPublicReviews(slug, PAGE_SIZE)
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <section
      id="portal-reviews"
      aria-labelledby={HEADING_ID}
      data-testid="portal-reviews-section"
      className="space-y-4"
      style={{ scrollMarginTop: '5rem' }}
    >
      <h2 id={HEADING_ID} className={catalogStyles.heading}>
        Reseñas
      </h2>

      {state === 'loading' && <Skeleton className="h-40 w-full" />}
      {state === 'error' && (
        <p className="text-sm text-muted-foreground">
          <span className="block font-medium text-foreground">No se pudieron cargar</span>
          Inténtalo de nuevo más tarde.
        </p>
      )}
      {state === 'ready' && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aún no hay reseñas para esta organización. ¡Sé el primero en dejar una!
        </p>
      )}
      {state === 'ready' && items.length > 0 && <ReviewCarousel items={items} />}

      <div className={styles.footer}>
        <RegisterReviewDialog
          slug={slug}
          member={member}
          submit={submitAsMember}
          onSubmitted={({ review, authorName, isCommunityMember }) =>
            setItems((current) => [
              {
                id: review.id,
                rating: review.rating,
                comment: review.comment,
                authorName,
                isCommunityMember,
                createdAt: review.createdAt,
              },
              ...current,
            ])
          }
        />
      </div>
    </section>
  );
}
