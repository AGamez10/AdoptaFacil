import { useEffect, useRef, useState } from 'react';
import {
  SERVICE_HOURS_MAX_PHOTOS,
  type ServiceHours,
  type ServiceHoursPhoto,
} from '@adoptafacil/contracts';
import { Button, useToast } from '@adoptafacil/ui';
import type { ApiClient } from '../../../shell/api';
import { useApiClient } from '../../../shell/api';

/** Tope de lo que se envía (el servidor reduce la foto a JPEG ≤ 1280 px). */
const MAX_UPLOAD_MB = 12;

/** Sube UNA foto de la jornada a una sesión propia. */
export async function uploadServiceHoursPhoto(
  client: ApiClient,
  serviceHoursId: string,
  file: File,
): Promise<ServiceHoursPhoto> {
  const form = new FormData();
  form.append('file', file, file.name);
  return client.request<ServiceHoursPhoto>(
    `/service-hours/${encodeURIComponent(serviceHoursId)}/photos`,
    { method: 'POST', body: form },
  );
}

/**
 * Botón "Agregar fotos de la jornada" del voluntario, en una sesión propia.
 * Sube una por una (el servidor exige que la sesión sea suya, que no esté
 * rechazada ni certificada, y un máximo de fotos por sesión).
 */
export function AddServiceHoursPhotos({
  entry,
  disabled,
  onUploaded,
}: {
  entry: ServiceHours;
  disabled?: boolean;
  onUploaded: () => void;
}) {
  const client = useApiClient();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const count = entry.photos?.length ?? 0;
  const left = SERVICE_HOURS_MAX_PHOTOS - count;

  const upload = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    const chosen = Array.from(files).slice(0, left);
    setBusy(true);
    let ok = 0;
    try {
      for (const file of chosen) {
        if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
          toast({
            title: 'Foto muy pesada',
            description: `${file.name} supera ${MAX_UPLOAD_MB} MB.`,
            variant: 'warning',
          });
          continue;
        }
        await uploadServiceHoursPhoto(client, entry.id, file);
        ok += 1;
      }
      if (ok > 0) {
        toast({
          title: ok === 1 ? 'Foto agregada' : `${ok} fotos agregadas`,
          description: 'La organización las verá junto a esta sesión y en su reporte.',
          variant: 'success',
        });
      }
    } catch (error) {
      toast({
        title: 'No se pudo subir la foto',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
      if (ok > 0) onUploaded();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span data-testid="service-hours-photo-count">
        {count === 0 ? 'Sin fotos de la jornada' : `${count} foto(s) de la jornada`}
      </span>
      {left > 0 && entry.status !== 'rejected' && !disabled && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            aria-label="Fotos de la jornada"
            onChange={(e) => void upload(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? 'Subiendo…' : 'Agregar fotos'}
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Miniaturas de las fotos de una sesión para la organización (archivo privado,
 * se descarga con la sesión de la organización). Clic = abrir en grande.
 */
export function ServiceHoursPhotoThumbs({ entry }: { entry: ServiceHours }) {
  const client = useApiClient();
  const photos = entry.photos ?? [];
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = photos.map((p) => p.id).join(',');

  const entryId = entry.id;
  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) return;
    let active = true;
    const created: string[] = [];
    void Promise.all(
      ids.map(async (photoId) => {
        try {
          const blob = await client.requestBlob(
            `/service-hours/${encodeURIComponent(entryId)}/photos/${encodeURIComponent(photoId)}/file`,
          );
          const url = URL.createObjectURL(blob);
          created.push(url);
          return [photoId, url] as const;
        } catch {
          return null;
        }
      }),
    ).then((pairs) => {
      if (!active) return;
      setUrls(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => !!p)));
    });
    return () => {
      active = false;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [client, entryId, key]);

  if (photos.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin fotos de la jornada.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Fotos de la jornada">
      {photos.map((photo) => (
        <li key={photo.id}>
          {urls[photo.id] ? (
            <a href={urls[photo.id]} target="_blank" rel="noreferrer">
              <img
                src={urls[photo.id]}
                alt="Foto de la jornada"
                className="h-16 w-20 rounded-md border object-cover"
              />
            </a>
          ) : (
            <span className="block h-16 w-20 animate-pulse rounded-md bg-muted" />
          )}
        </li>
      ))}
    </ul>
  );
}
