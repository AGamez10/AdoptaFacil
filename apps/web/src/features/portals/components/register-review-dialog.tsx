import { useState } from 'react';
import type { Review } from '@adoptafacil/contracts';
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

export interface RegisterReviewDialogProps {
  slug: string;
  /** Se llama justo tras un envío exitoso — el llamador la muestra de inmediato
   *  (el cliente pidió que, al registrarse, se vea sin esperar un refetch). */
  onSubmitted: (review: Review) => void;
  /**
   * Modo controlado (plantillas del portal): la plantilla abre el diálogo desde
   * su propio botón, así que aquí no se pinta el disparador. Sin estas props el
   * componente se comporta exactamente como antes.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

/**
 * Botón "Registrar reseña" del portal público (S7-b, pedido del cliente) —
 * abre un modal con estrellas + comentario, SIN pedir ningún dato de
 * identidad (nombre, correo, cuenta): "no necesita estar registrado de
 * ninguna forma, es decir pueden ser registros anónimos". Envía a
 * `POST /public/organizations/:slug/reviews` (sin token) y queda visible de
 * inmediato — nunca pasa por una cola de aprobación.
 */
export function RegisterReviewDialog({
  slug,
  onSubmitted,
  open: controlledOpen,
  onOpenChange,
}: RegisterReviewDialogProps) {
  const { toast } = useToast();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setRating(5);
    setComment('');
  };

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    try {
      const created = await submitPublicReview(slug, {
        rating,
        comment: comment.trim() || undefined,
      });
      onSubmitted(created);
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
      {!controlled && (
        <DialogTrigger asChild>
          <button type="button" className={`${styles.btn} ${styles['btn--primary']}`}>
            Registrar reseña
          </button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar reseña</DialogTitle>
          <DialogDescription>
            Cuéntanos tu experiencia con esta organización. No necesitas una cuenta — tu reseña
            puede ser anónima.
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
          <p className={styles.hint}>Tu reseña se publicará de inmediato en este portal.</p>
        </div>
        <DialogFooter>
          <button
            type="button"
            className={`${styles.btn} ${styles['btn--primary']}`}
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? 'Enviando…' : 'Enviar reseña'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
