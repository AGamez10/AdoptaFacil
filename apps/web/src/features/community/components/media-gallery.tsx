import { useState } from 'react';
import type { PostImage } from '@adoptafacil/contracts';
import { Dialog, DialogContent, DialogDescription, DialogTitle, cn } from '@adoptafacil/ui';
import { formatDuration } from '../lib/media';

interface MediaGalleryProps {
  media: PostImage[];
  /** Quien publica, para el texto alternativo de las fotos. */
  authorName: string;
  className?: string;
}

const isVideo = (item: PostImage) => item.kind === 'video';

function PlayBadge({ seconds }: { seconds?: number }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition-transform group-hover:scale-110"
      >
        <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-current">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      {seconds ? (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
          {formatDuration(seconds)}
        </span>
      ) : null}
    </>
  );
}

function Tile({
  item,
  authorName,
  index,
  extra,
  onOpen,
  className,
}: {
  item: PostImage;
  authorName: string;
  index: number;
  extra: number;
  onOpen: (index: number) => void;
  className?: string;
}) {
  const video = isVideo(item);
  const label = video ? `Reproducir el video de ${authorName}` : `Ver la foto ${index + 1}`;
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={label}
      data-testid={video ? 'post-video' : 'post-photo'}
      className={cn(
        'group relative block w-full overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <img
        src={video ? (item.posterUrl ?? '') : item.url}
        alt={video ? '' : `Foto ${index + 1} de la publicación de ${authorName}`}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        onError={(event) => {
          // Un video sin portada (subida incompleta) no deja un ícono roto.
          event.currentTarget.style.visibility = 'hidden';
        }}
      />
      {video && <PlayBadge seconds={item.durationSeconds} />}
      {extra > 0 && (
        <span className="absolute inset-0 grid place-items-center bg-black/55 text-3xl font-bold text-white">
          +{extra}
        </span>
      )}
    </button>
  );
}

/**
 * Fotos y video de una publicación: cuadrícula según cuántos son y, al tocar
 * uno, un visor grande (con el video reproduciéndose). Un video solo se baja
 * cuando la persona lo pide.
 */
export function MediaGallery({ media, authorName, className }: MediaGalleryProps) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  if (media.length === 0) return null;

  const shown = media.slice(0, 4);
  const hidden = media.length - shown.length;
  const current = openAt !== null ? media[openAt] : null;

  const layout =
    shown.length === 1
      ? 'grid-cols-1'
      : shown.length === 3
        ? 'grid-cols-2 [&>*:first-child]:col-span-2'
        : 'grid-cols-2';
  const ratio =
    shown.length === 1
      ? 'aspect-[16/10] sm:aspect-[16/9]'
      : shown.length === 3
        ? 'aspect-[16/9] [&:not(:first-child)]:aspect-[4/3]'
        : 'aspect-[4/3]';

  return (
    <>
      <div className={cn('grid gap-0.5', layout, className)} data-testid="media-gallery">
        {shown.map((item, index) => (
          <Tile
            key={item.id}
            item={item}
            authorName={authorName}
            index={index}
            extra={index === shown.length - 1 ? hidden : 0}
            onOpen={setOpenAt}
            className={ratio}
          />
        ))}
      </div>

      <Dialog open={openAt !== null} onOpenChange={(open) => !open && setOpenAt(null)}>
        <DialogContent className="max-w-4xl border-0 bg-black p-0 sm:rounded-2xl">
          <DialogTitle className="sr-only">
            {current && isVideo(current) ? 'Video de la publicación' : 'Foto de la publicación'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Publicación de {authorName}. Cierra con la tecla Escape.
          </DialogDescription>
          {current && (
            <div className="flex max-h-[85vh] items-center justify-center">
              {isVideo(current) ? (
                <video
                  key={current.id}
                  src={current.url}
                  poster={current.posterUrl}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  className="max-h-[85vh] w-full bg-black"
                  data-testid="post-video-player"
                />
              ) : (
                <img
                  src={current.url}
                  alt={`Foto de la publicación de ${authorName}`}
                  className="max-h-[85vh] w-full object-contain"
                />
              )}
            </div>
          )}
          {media.length > 1 && openAt !== null && (
            <div className="flex items-center justify-between gap-2 bg-black/90 px-4 py-2 text-white">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-40"
                disabled={openAt === 0}
                onClick={() => setOpenAt(openAt - 1)}
              >
                ← Anterior
              </button>
              <span className="text-sm" aria-live="polite">
                {openAt + 1} de {media.length}
              </span>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-40"
                disabled={openAt === media.length - 1}
                onClick={() => setOpenAt(openAt + 1)}
              >
                Siguiente →
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
