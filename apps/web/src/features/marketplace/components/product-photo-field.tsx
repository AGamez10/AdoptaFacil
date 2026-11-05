import { useId, useRef } from 'react';
import { Button } from '@adoptafacil/ui';
import { IMAGE_ACCEPT, MAX_UPLOAD_MB } from '../lib/storage';

export interface ProductPhotoFieldProps {
  /** Foto actual (URL pública o vista previa local), o `null` si no tiene. */
  imageUrl: string | null;
  alt: string;
  canManage: boolean;
  busy?: boolean;
  onSelect: (file: File) => void;
  onRemove?: () => void;
}

/**
 * La foto del producto (M10): una sola. Muestra la actual o un espacio vacío,
 * y deja subirla, cambiarla o quitarla. La compresión ocurre al subir.
 */
export function ProductPhotoField({
  imageUrl,
  alt,
  canManage,
  busy = false,
  onSelect,
  onRemove,
}: ProductPhotoFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start" data-testid="product-photo">
      <div className="aspect-square w-full max-w-[220px] overflow-hidden rounded-md border bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={alt}
            className="h-full w-full object-cover"
            data-testid="product-photo-image"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
            Sin foto todavía
          </div>
        )}
      </div>
      {canManage && (
        <div className="space-y-3">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={IMAGE_ACCEPT.join(',')}
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onSelect(file);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? 'Subiendo…' : imageUrl ? 'Cambiar foto' : 'Subir foto'}
            </Button>
            {imageUrl && onRemove && (
              <Button size="sm" variant="outline" disabled={busy} onClick={onRemove}>
                Quitar foto
              </Button>
            )}
          </div>
          <label htmlFor={inputId} className="block text-xs text-muted-foreground">
            Una sola foto por producto: JPG, PNG o WebP de hasta {MAX_UPLOAD_MB} MB. La optimizamos
            para que cargue rápido.
          </label>
        </div>
      )}
    </div>
  );
}
