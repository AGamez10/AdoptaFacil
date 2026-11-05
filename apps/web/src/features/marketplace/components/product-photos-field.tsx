import { useId, useRef } from 'react';
import { Button } from '@adoptafacil/ui';
import { IMAGE_ACCEPT, MAX_PRODUCT_PHOTOS, MAX_UPLOAD_MB } from '../lib/storage';

export interface ProductPhoto {
  /** Identifica la foto en los callbacks (id del servidor o posición local). */
  key: string;
  /** URL pública o vista previa local. */
  url: string;
}

export interface ProductPhotosFieldProps {
  photos: readonly ProductPhoto[];
  alt: string;
  canManage: boolean;
  busy?: boolean;
  onAdd: (file: File) => void;
  onReplace: (key: string, file: File) => void;
  onRemove: (key: string) => void;
}

/**
 * Las fotos del producto (M10): hasta dos. La primera es la de la tarjeta del
 * catálogo; ambas se ven en el detalle. Deja subir, cambiar y quitar. La
 * compresión ocurre al subir y cada foto cuenta en el espacio del plan.
 */
export function ProductPhotosField({
  photos,
  alt,
  canManage,
  busy = false,
  onAdd,
  onReplace,
  onRemove,
}: ProductPhotosFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // Qué foto reemplaza el archivo que se elija; `null` = agregar una nueva.
  const replacing = useRef<string | null>(null);

  const pick = (key: string | null): void => {
    replacing.current = key;
    inputRef.current?.click();
  };

  const canAdd = canManage && photos.length < MAX_PRODUCT_PHOTOS;

  if (!canManage && photos.length === 0) {
    return (
      <div
        className="flex aspect-square w-full max-w-[220px] items-center justify-center rounded-md border bg-muted p-4 text-center text-sm text-muted-foreground"
        data-testid="product-photos"
      >
        Sin foto todavía
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="product-photos">
      {canManage && (
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={IMAGE_ACCEPT.join(',')}
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            const key = replacing.current;
            event.target.value = '';
            if (!file) return;
            if (key) onReplace(key, file);
            else onAdd(file);
          }}
        />
      )}
      <ul className="grid max-w-md grid-cols-2 gap-3">
        {photos.map((photo, index) => (
          <li key={photo.key} className="space-y-2" data-testid="product-photo">
            <div className="aspect-square overflow-hidden rounded-md border bg-muted">
              <img
                src={photo.url}
                alt={index === 0 ? alt : `${alt} (foto ${index + 1})`}
                className="h-full w-full object-cover"
                loading="lazy"
                data-testid="product-photo-image"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {index === 0 ? 'Foto principal' : 'Foto 2'}
            </p>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => pick(photo.key)}>
                  Cambiar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onRemove(photo.key)}
                >
                  Quitar
                </Button>
              </div>
            )}
          </li>
        ))}
        {canAdd && (
          <li className="space-y-2" data-testid="product-photo-add">
            <div className="flex aspect-square items-center justify-center rounded-md border border-dashed bg-muted p-3 text-center text-sm text-muted-foreground">
              {photos.length === 0 ? 'Sin foto todavía' : 'Puedes agregar una segunda foto'}
            </div>
            <Button size="sm" disabled={busy} onClick={() => pick(null)}>
              {busy ? 'Subiendo…' : photos.length === 0 ? 'Subir foto' : 'Agregar segunda foto'}
            </Button>
          </li>
        )}
      </ul>
      {canManage && (
        <label htmlFor={inputId} className="block text-xs text-muted-foreground">
          Hasta {MAX_PRODUCT_PHOTOS} fotos por producto: JPG, PNG o WebP de hasta {MAX_UPLOAD_MB}{' '}
          MB. La primera es la que se ve en el catálogo. Las optimizamos para que carguen rápido y
          cada foto cuenta en el espacio de almacenamiento de tu plan.
        </label>
      )}
    </div>
  );
}
