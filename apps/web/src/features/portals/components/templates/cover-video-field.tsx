import { useId, useRef, useState } from 'react';
import { Button, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../../shell/api';
import {
  COVER_VIDEO_ACCEPT,
  COVER_VIDEO_MAX_MB,
  uploadCoverVideo,
  validateCoverVideo,
} from '../../api/cover-video';

export interface CoverVideoFieldProps {
  /** URL que se ve ahora (la guardada o la recién subida). */
  url?: string;
  /** Llave recién subida (string) o `null` para quitar el video al guardar. */
  onChange: (next: { key: string | null; url?: string }) => void;
}

/**
 * Video de portada de la plantilla Historias (opcional). Se sube al momento
 * (llave pública de la organización) y se guarda con "Guardar y publicar".
 * Sin sonido y en bucle en el portal; no se reproduce si el visitante pidió
 * menos movimiento o ahorrar datos.
 */
export function CoverVideoField({ url, onChange }: CoverVideoFieldProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateCoverVideo(file);
    if (problem) {
      toast({ title: 'No se pudo usar ese video', description: problem, variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const key = await uploadCoverVideo(client, file);
      onChange({ key, url: URL.createObjectURL(file) });
    } catch (error) {
      toast({
        title: 'No se pudo subir el video',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2" data-testid="cover-video-field">
      <label htmlFor={inputId} className="block text-sm font-medium">
        Video de portada (opcional)
      </label>
      <p className="text-sm text-muted-foreground">
        Se ve en la primera historia, sin sonido y en bucle. MP4 o WebM de hasta{' '}
        {COVER_VIDEO_MAX_MB} MB; lo ideal son 10 a 20 segundos grabados en vertical.
      </p>
      {url && (
        <video
          src={url}
          muted
          loop
          playsInline
          autoPlay
          className="aspect-[9/16] max-h-64 rounded-xl bg-muted object-cover"
          data-testid="cover-video-preview"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={COVER_VIDEO_ACCEPT}
          className="sr-only"
          onChange={(event) => void onFile(event.target.files?.[0])}
          data-testid="cover-video-input"
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Subiendo…' : url ? 'Cambiar video' : 'Subir video'}
        </Button>
        {url && !uploading && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange({ key: null, url: undefined })}
            data-testid="cover-video-remove"
          >
            Quitar
          </Button>
        )}
      </div>
    </div>
  );
}
