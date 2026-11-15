import { useEffect, useRef, useState } from 'react';
import type { PostReaction, PostReactionCounts } from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { REACTION_META, REACTION_ORDER, reactionSummaryText, topReactions } from '../lib/reactions';
import styles from './community.module.scss';

interface ReactionBarProps {
  value: PostReaction | null;
  onChange: (next: PostReaction | null) => void;
  disabled?: boolean;
}

const HOVER_OPEN_MS = 280;
const LONG_PRESS_MS = 450;

/**
 * Botón de reacción: un toque pone/quita "Me gusta"; al pasar el mouse, dejar
 * presionado (celular) o llegar con el teclado, se abre la bandeja con las cinco
 * reacciones. La elegida queda con su emoji y color, y salta una animación.
 */
export function ReactionBar({ value, onChange, disabled }: ReactionBarProps) {
  const [open, setOpen] = useState(false);
  const [burst, setBurst] = useState<{ n: number; emoji: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const root = useRef<HTMLDivElement | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  // Se cierra al tocar fuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (next: PostReaction | null) => {
    setOpen(false);
    if (next) setBurst({ n: Date.now(), emoji: REACTION_META[next].emoji });
    onChange(next);
  };

  const meta = value ? REACTION_META[value] : null;

  return (
    <div
      ref={root}
      className="relative"
      onMouseEnter={() => {
        if (disabled) return;
        clear();
        timer.current = setTimeout(() => setOpen(true), HOVER_OPEN_MS);
      }}
      onMouseLeave={() => {
        clear();
        timer.current = setTimeout(() => setOpen(false), 220);
      }}
    >
      {open && (
        <div
          role="group"
          aria-label="Elige una reacción"
          className={cn(
            styles.tray,
            'absolute bottom-full left-0 z-20 mb-2 flex gap-1 rounded-full border bg-card px-2 py-1.5 shadow-xl',
          )}
          data-testid="reaction-tray"
        >
          {REACTION_ORDER.map((reaction, index) => (
            <button
              key={reaction}
              type="button"
              aria-label={REACTION_META[reaction].label}
              aria-pressed={value === reaction}
              title={REACTION_META[reaction].label}
              style={{ ['--i' as string]: index }}
              className={cn(
                styles.trayItem,
                'grid h-10 w-10 place-items-center rounded-full text-2xl',
                value === reaction && 'bg-muted',
              )}
              onClick={() => choose(value === reaction ? null : reaction)}
            >
              <span aria-hidden="true">{REACTION_META[reaction].emoji}</span>
            </button>
          ))}
        </div>
      )}

      {burst && (
        <span key={burst.n} className={styles.burst} aria-hidden="true">
          {burst.emoji}
        </span>
      )}

      <button
        type="button"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        aria-pressed={value !== null}
        data-testid="reaction-button"
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          meta ? meta.tone : 'text-muted-foreground',
        )}
        onFocus={(event) => {
          if (disabled) return;
          try {
            if (event.currentTarget.matches(':focus-visible')) setOpen(true);
          } catch {
            /* navegadores sin :focus-visible: la bandeja se abre con el mouse o el toque largo */
          }
        }}
        onPointerDown={(event) => {
          if (disabled || event.pointerType === 'mouse') return;
          longPressed.current = false;
          clear();
          timer.current = setTimeout(() => {
            longPressed.current = true;
            setOpen(true);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={clear}
        onPointerCancel={clear}
        onContextMenu={(event) => {
          if (longPressed.current) event.preventDefault();
        }}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          choose(value ? null : 'like');
        }}
      >
        <span
          key={value ?? 'none'}
          className={cn('text-lg leading-none', value && styles.pop)}
          aria-hidden="true"
        >
          {meta ? meta.emoji : '👍'}
        </span>
        <span>{meta ? meta.label : 'Me gusta'}</span>
      </button>
    </div>
  );
}

interface ReactionSummaryProps {
  counts: PostReactionCounts;
  total: number;
  mine: boolean;
  className?: string;
}

/** Los emojis más usados apilados + "Tú y 3 personas más". */
export function ReactionSummary({ counts, total, mine, className }: ReactionSummaryProps) {
  const top = topReactions(counts);
  // Datos viejos: había "me gusta" sin desglose.
  const shown = top.length > 0 ? top.map((t) => t.reaction) : total > 0 ? (['like'] as const) : [];
  if (total <= 0) return null;
  return (
    <span
      className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', className)}
      data-testid="reaction-summary"
    >
      <span className="flex -space-x-1.5" aria-hidden="true">
        {shown.map((reaction) => (
          <span
            key={reaction}
            className="grid h-6 w-6 place-items-center rounded-full border-2 border-card bg-muted text-sm"
          >
            {REACTION_META[reaction].emoji}
          </span>
        ))}
      </span>
      <span>{reactionSummaryText(total, mine)}</span>
    </span>
  );
}
