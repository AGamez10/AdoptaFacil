import { useState } from 'react';
import type { CreatePublicReviewInput, Review } from '@adoptafacil/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useToast,
} from '@adoptafacil/ui';
import { submitPublicReview } from '../api/public-reviews';
import styles from '../styles/public-reviews.module.scss';

/** Quien escribe con su sesión de AdoptaFácil iniciada. */
export interface ReviewMember {
  /** Nombre de su cuenta — el único que puede mostrar (nunca uno libre). */
  name: string;
  /** La cuenta pertenece a la organización reseñada: no puede reseñarla. */
  isOwnOrganization: boolean;
}

/** Lo que el portal pinta de inmediato tras enviar, sin esperar un refetch. */
export interface SubmittedReview {
  review: Review;
  authorName?: string;
  isCommunityMember: boolean;
}

export interface RegisterReviewDialogProps {
  slug: string;
  /** Se llama justo tras un envío exitoso — el llamador la muestra de inmediato
   *  (el cliente pidió que, al registrarse, se vea sin esperar un refetch). */
  onSubmitted: (submitted: SubmittedReview) => void;
  /** Presente cuando hay sesión: la reseña lleva el sello "Miembro de la
   *  comunidad" y se envía con `submit` (con token). */
  member?: ReviewMember;
  /** Envío con la sesión del miembro. Sin él se usa el envío público sin
   *  token (`submitPublicReview`). */
  submit?: (slug: string, input: CreatePublicReviewInput) => Promise<Review>;
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;
const NAME_MAX = 60;

/**
 * Botón "Registrar reseña" del portal público (S7-b, pedido del cliente) —
 * abre un modal con estrellas + comentario. No exige cuenta: "pueden ser
 * registros anónimos". Queda visible de inmediato, sin cola de aprobación.
 *
 * Desde 2026-11-05 identifica a quien escribe, siempre de forma opcional:
 * - visitante sin sesión: puede escribir su nombre (texto libre, se muestra
 *   sin sello porque no está verificado);
 * - miembro con sesión: la reseña lleva el sello "Miembro de la comunidad" y
 *   decide si se muestra el nombre de su cuenta (por defecto no, Ley 1581).
 */
export function RegisterReviewDialog({
  slug,
  onSubmitted,
  member,
  submit: submitWithSession,
}: RegisterReviewDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [showMyName, setShowMyName] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setRating(5);
    setComment('');
    setAuthorName('');
    setShowMyName(false);
  };

  const blocked = member?.isOwnOrganization === true;

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    try {
      const base = { rating, comment: comment.trim() || undefined };
      const visitorName = authorName.trim().replace(/\s+/g, ' ') || undefined;
      const created = member
        ? await (submitWithSession ?? submitPublicReview)(slug, {
            ...base,
            isAnonymous: !showMyName,
          })
        : await submitPublicReview(slug, { ...base, authorName: visitorName });
      onSubmitted({
        review: created,
        authorName: member ? (showMyName ? member.name : undefined) : visitorName,
        isCommunityMember: Boolean(member),
      });
      toast({ title: '¡Gracias por tu reseña!', description: 'Ya está visible en el portal.' });
      setOpen(false);
      reset();
    } catch (error) {
      toast({
        title: 'No se pudo enviar tu reseña',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className={`${styles.btn} ${styles['btn--primary']}`}>
          Registrar reseña
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar reseña</DialogTitle>
          <DialogDescription>
            {member
              ? 'Cuéntanos tu experiencia con esta organización.'
              : 'Cuéntanos tu experiencia con esta organización. No necesitas una cuenta — tu reseña puede ser anónima.'}
          </DialogDescription>
        </DialogHeader>
        <div className={styles.form}>
          <div className={styles.field}>
            <span className={styles.field__label}>Calificación</span>
            <div
              className={styles.stars}
              role="radiogroup"
              aria-label="Calificación de 1 a 5 estrellas"
            >
              {STAR_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} de 5 estrellas`}
                  className={`${styles.star} ${value <= rating ? styles['star--filled'] : ''}`}
                  onClick={() => setRating(value)}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="public-review-comment" className={styles.field__label}>
              Comentario (opcional)
            </label>
            <textarea
              id="public-review-comment"
              className={styles.textarea}
              value={comment}
              maxLength={2000}
              onChange={(event) => setComment(event.target.value)}
              placeholder="¿Qué te gustaría contarle a otros visitantes?"
            />
          </div>
          {member ? (
            <div className={styles.field}>
              <p className={styles.memberNote}>
                <span className={styles.badge}>Miembro de la comunidad</span>
                Tu reseña llevará este sello porque escribes con tu cuenta de AdoptaFácil.
              </p>
              {blocked ? (
                <p className={styles.hint} role="alert">
                  No puedes reseñar tu propia organización.
                </p>
              ) : (
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={showMyName}
                    onChange={(event) => setShowMyName(event.target.checked)}
                  />
                  <span>
                    Mostrar mi nombre (<strong>{member.name}</strong>). Si no lo marcas, se publica
                    como anónima, con el sello.
                  </span>
                </label>
              )}
            </div>
          ) : (
            <div className={styles.field}>
              <label htmlFor="public-review-name" className={styles.field__label}>
                Tu nombre (opcional)
              </label>
              <input
                id="public-review-name"
                className={styles.input}
                value={authorName}
                maxLength={NAME_MAX}
                autoComplete="name"
                onChange={(event) => setAuthorName(event.target.value)}
                placeholder="Si lo dejas vacío, se publica como anónima"
              />
              <p className={styles.hint}>
                Se mostrará públicamente junto a tu reseña. No escribas teléfonos, correos ni
                enlaces. Si tienes cuenta en AdoptaFácil, inicia sesión antes de escribir y tu
                reseña llevará el sello «Miembro de la comunidad».
              </p>
            </div>
          )}
          <p className={styles.hint}>Tu reseña se publicará de inmediato en este portal.</p>
        </div>
        <DialogFooter>
          <button
            type="button"
            className={`${styles.btn} ${styles['btn--primary']}`}
            disabled={submitting || blocked}
            onClick={() => void submit()}
          >
            {submitting ? 'Enviando…' : 'Enviar reseña'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
