import { useId, useRef, useState } from 'react';
import { Button, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../../shell/api';
import type { PortalTemplateId } from '@adoptafacil/contracts';
import {
  COVER_VIDEO_ACCEPT,
  COVER_VIDEO_MAX_MB,
  COVER_VIDEO_MAX_SECONDS,
  uploadCoverVideo,
  validateCoverVideo,
} from '../../api/cover-video';

export interface CoverVideoFieldProps {
  /** URL que se ve ahora (la guardada o la recién subida). */
  url?: string;
  /** Llave recién subida (string) o `null` para quitar el video al guardar. */
  onChange: (next: { key: string | null; url?: string }) => void;
  /** Plantilla que lo muestra: cambia la recomendación de duración y formato. */
  template?: PortalTemplateId;
  /** 2 = segundo video de Documental (se reproduce después del primero). */
  slot?: 1 | 2;
}

const HINTS: Partial<Record<PortalTemplateId, string>> = {
  historias:
    'Se ve en la primera historia, sin sonido y en bucle. Lo ideal son 10 a 20 segundos grabados en vertical.',
  documental:
    'Abre tu portal a pantalla completa y te acompaña mientras bajas. Lo ideal son 30 a 60 segundos grabados en horizontal; quien visita puede activar el sonido.',
};

/**
 * Video de portada (opcional) de Historias y Documental. Se sube al momento
 * (llave pública de la organización), el servidor lo comprime y se guarda con
 * "Guardar y publicar". Arranca sin sonido; no se reproduce solo si el
 * visitante pidió menos movimiento o ahorrar datos.
 */
export function CoverVideoField({
  url,
  onChange,
  template = 'historias',
  slot = 1,
}: CoverVideoFieldProps) {
  const tid = (name: string) => (slot === 2 ? `${name}-2` : name);
  const client = useApiClient();
  const { toast } = useToast();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    // La duración la revisa el servidor al comprimir (responde el motivo).
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
    <div className="space-y-2" data-testid={tid('cover-video-field')}>
      <label htmlFor={inputId} className="block text-sm font-medium">
        {slot === 2 ? 'Segundo video (opcional)' : 'Video de portada (opcional)'}
      </label>
      <p className="text-sm text-muted-foreground">
        {slot === 2
          ? 'Se reproduce después del primero y luego vuelven a empezar. Úsalo para otra escena: un rescate, el día a día o una adopción.'
          : (HINTS[template] ?? HINTS.historias)}{' '}
        MP4, MOV o WebM de hasta {COVER_VIDEO_MAX_SECONDS} segundos y {COVER_VIDEO_MAX_MB} MB; lo
        comprimimos para que cargue rápido.
      </p>
      {url && (
        <video
          src={url}
          muted
          loop
          playsInline
          autoPlay
          className={
            template === 'documental'
              ? 'aspect-video w-full max-w-sm rounded-xl bg-muted object-cover'
              : 'aspect-[9/16] max-h-64 rounded-xl bg-muted object-cover'
          }
          data-testid={tid('cover-video-preview')}
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
          data-testid={tid('cover-video-input')}
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Subiendo y comprimiendo…' : url ? 'Cambiar video' : 'Subir video'}
        </Button>
        {url && !uploading && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange({ key: null, url: undefined })}
            data-testid={tid('cover-video-remove')}
          >
            Quitar
          </Button>
        )}
      </div>
    </div>
  );
}
