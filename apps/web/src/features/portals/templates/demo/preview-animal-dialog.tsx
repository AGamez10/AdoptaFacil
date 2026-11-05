import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { AnimalSummary, PublicAnimalSummary } from '@adoptafacil/contracts';
import {
  buttonVariants,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@adoptafacil/ui';
import { AnimalSpotlightCard } from '../../../catalog/components/animal-spotlight-card';
import { useFeature } from '../../../../shell/capabilities';
import {
  PublicAnimalDetailArticle,
  type PublicAnimalOrg,
} from '../../components/public-animal-detail-article';
import styles from '../../pages/public-animal-detail-page.module.scss';

const SIMILAR_MAX = 4;

export interface PreviewAnimalDialogProps {
  /** Animal abierto; `null` cierra el diálogo. */
  animal: AnimalSummary | null;
  /** Todos los animales de la vista previa (para "Más amigos de…"). */
  animals: readonly AnimalSummary[];
  org: PublicAnimalOrg;
  slug: string;
  onOpenAnimal: (animal: AnimalSummary | null) => void;
}

/**
 * La ficha del animal dentro de la vista previa de una plantilla: el MISMO
 * contenido que ve quien visita el portal (`PublicAnimalDetailArticle`), pero
 * en un diálogo y sin salir de la página. Los botones se ven igual que en el
 * portal y no llevan a ninguna parte (los datos pueden ser de ejemplo, o de una
 * organización que aún no está publicada).
 */
export function PreviewAnimalDialog({
  animal,
  animals,
  org,
  slug,
  onOpenAnimal,
}: PreviewAnimalDialogProps) {
  const payments = useFeature('payments');
  const [notice, setNotice] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setNotice(false);
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [animal?.id]);

  const similar = useMemo<PublicAnimalSummary[]>(
    () =>
      animal
        ? animals
            .filter((a) => a.id !== animal.id)
            .slice(0, SIMILAR_MAX)
            .map((a) => ({
              ...a,
              organization: {
                id: org.id,
                name: org.name,
                slug,
                logoUrl: org.logoUrl,
                city: org.location?.city,
              },
            }))
        : [],
    [animal, animals, org, slug],
  );

  // "Más amigos de…": abre esa ficha aquí mismo.
  const openSimilar = (event: MouseEvent) => {
    const card = (event.target as Element).closest('[data-animal-id]');
    if (!card) return;
    event.preventDefault();
    const next = animals.find((a) => a.id === card.getAttribute('data-animal-id'));
    if (next) onOpenAnimal(next);
  };

  const inert = (event: MouseEvent) => {
    event.preventDefault();
    setNotice(true);
  };
  const size = 'lg';
  const item = 'w-full justify-center';

  return (
    <Dialog open={Boolean(animal)} onOpenChange={(open) => !open && onOpenAnimal(null)}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto bg-[var(--af-cream)] p-0 text-[var(--af-ink)]"
        // Ancho de la ficha real (el diálogo base mide 32rem) y por encima de la
        // barra de la vista de ejemplo.
        style={{ maxWidth: 'min(64rem, 96vw)', zIndex: 70 }}
        data-testid="preview-animal-dialog"
      >
        {animal && (
          <div ref={topRef} className={styles.container} style={{ paddingBlock: '1.5rem' }}>
            <DialogTitle className="sr-only">Ficha de {animal.name}</DialogTitle>
            <DialogDescription className="sr-only">
              Así ve la ficha de {animal.name} quien visita el portal.
            </DialogDescription>
            <PublicAnimalDetailArticle
              animal={animal}
              org={org}
              city={org.location?.city}
              actions={
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={inert}
                      className={cn(buttonVariants({ size }), item, 'sm:col-span-2')}
                    >
                      Solicitar adopción
                    </button>
                    {payments && (
                      <button
                        type="button"
                        onClick={inert}
                        className={cn(buttonVariants({ variant: 'outline', size }), item)}
                      >
                        Donar
                      </button>
                    )}
                  </div>
                  <p className="text-left text-xs text-muted-foreground" aria-live="polite">
                    {notice
                      ? 'Vista previa: en el portal publicado este botón lleva a la solicitud.'
                      : `Necesitarás iniciar sesión como persona para solicitar adopción de ${animal.name}.`}
                  </p>
                </div>
              }
            />
            {similar.length > 0 && (
              <section
                className={styles.similar}
                aria-labelledby="preview-similar-title"
                onClickCapture={openSimilar}
              >
                <div className={styles.similar__head}>
                  <h2 id="preview-similar-title" className={styles.similar__title}>
                    Más amigos de {org.name}
                  </h2>
                </div>
                <ul className={styles.similar__grid}>
                  {similar.map((item) => (
                    <li key={item.id} data-animal-id={item.id}>
                      <AnimalSpotlightCard animal={item} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
