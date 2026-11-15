import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COMMUNITY_MEDIA_LIMITS,
  POST_TYPES,
  PostType,
  type CreatePostInput,
  type CreatePostResult,
  type Post,
} from '@adoptafacil/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
  friendlyErrorMessage,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { TYPE_LABELS } from '../model/community-view';
import {
  MEDIA_ACCEPT,
  formatDuration,
  mediaKindOf,
  readVideoDuration,
  toMediaInput,
  uploadMedia,
  validateMedia,
} from '../lib/media';
import { AuthorAvatar } from './author-avatar';

const TYPE_HINT: Record<PostType, string> = {
  [PostType.General]: 'Una historia, una foto, una pregunta',
  [PostType.Campaign]: 'Pide ayuda para un caso',
  [PostType.Notice]: 'Un aviso para la comunidad',
  [PostType.Event]: 'Una jornada, feria o caminata',
};

const MAX_BODY = 2000;
const MIN_BODY = 10;

interface Picked {
  file: File;
  preview: string;
  seconds: number | null;
}

interface PostComposerProps {
  userName: string;
  isOrganization: boolean;
  onCreated: (post: Post) => void;
}

/**
 * Publicar en la comunidad: una tarjeta "¿Qué quieres compartir?" arriba del
 * muro que abre el formulario. Admite hasta 6 fotos y 1 video (se comprime en
 * el servidor); si alguna subida falla, la publicación NO queda a medias.
 */
export function PostComposer({ userName, isOrganization, onCreated }: PostComposerProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PostType>(PostType.General);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [shareable, setShareable] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  // Libera las vistas previas al cambiar o cerrar.
  useEffect(
    () => () => {
      picked.forEach((p) => URL.revokeObjectURL(p.preview));
    },
    [],
  );

  const hasVideo = useMemo(() => picked.some((p) => mediaKindOf(p.file) === 'video'), [picked]);

  const reset = (): void => {
    picked.forEach((p) => URL.revokeObjectURL(p.preview));
    setType(PostType.General);
    setTitle('');
    setBody('');
    setPicked([]);
    setShareable(true);
  };

  const addFiles = async (list: FileList | File[] | null): Promise<void> => {
    const incoming = Array.from(list ?? []);
    let current = picked.map((p) => p.file);
    const added: Picked[] = [];
    for (const file of incoming) {
      const problem = validateMedia(file, current);
      if (problem) {
        toast({ title: 'No se pudo agregar', description: problem, variant: 'warning' });
        continue;
      }
      const isVideo = mediaKindOf(file) === 'video';
      const seconds = isVideo ? await readVideoDuration(file) : null;
      if (seconds !== null && seconds > COMMUNITY_MEDIA_LIMITS.maxVideoSeconds + 0.5) {
        toast({
          title: 'El video es muy largo',
          description: `Dura ${Math.round(seconds)} s. El máximo es ${COMMUNITY_MEDIA_LIMITS.maxVideoSeconds} s.`,
          variant: 'warning',
        });
        continue;
      }
      added.push({ file, preview: URL.createObjectURL(file), seconds });
      current = [...current, file];
    }
    if (added.length > 0) setPicked((prev) => [...prev, ...added]);
  };

  const removeAt = (index: number): void => {
    setPicked((prev) => {
      const gone = prev[index];
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const submit = async (): Promise<void> => {
    if (body.trim().length < MIN_BODY) {
      toast({
        title: 'Cuéntanos un poco más',
        description: `Escribe al menos ${MIN_BODY} caracteres.`,
        variant: 'warning',
      });
      return;
    }
    setSaving('Publicando…');
    let created: CreatePostResult | null = null;
    try {
      const input: CreatePostInput = {
        type,
        ...(title.trim() ? { title: title.trim() } : {}),
        body: body.trim(),
        ...(shareable ? { shareable: true } : {}),
        ...(picked.length > 0
          ? { images: picked.map((p, index) => toMediaInput(p.file, index)) }
          : {}),
      };
      created = await client.request<CreatePostResult>('/community/posts', {
        method: 'POST',
        json: input,
      });
      const uploads = created.imageUploads;
      let done = 0;
      const videoOrder = picked.findIndex((p) => mediaKindOf(p.file) === 'video');
      setSaving(videoOrder >= 0 ? 'Subiendo y comprimiendo tu video…' : 'Subiendo tus fotos…');
      await Promise.all(
        uploads.map(async (upload) => {
          const item = picked[upload.order];
          if (!item) return;
          await uploadMedia(client, upload.key, item.file);
          done += 1;
          if (uploads.length > 1) setSaving(`Subiendo archivos (${done} de ${uploads.length})…`);
        }),
      );
      onCreated(created.post);
      reset();
      setOpen(false);
      toast({ title: 'Publicado', description: 'Ya está en el muro.', variant: 'success' });
    } catch (error) {
      // Una publicación con la foto o el video a medias no sirve: se retira.
      if (created) {
        await client
          .request(`/community/posts/${encodeURIComponent(created.post.id)}`, { method: 'DELETE' })
          .catch(() => undefined);
      }
      toast({
        title: 'No se pudo publicar',
        description: friendlyErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <div className="rounded-2xl border bg-card p-4 shadow-sm" data-testid="post-composer-card">
        <div className="flex items-center gap-3">
          <AuthorAvatar name={userName} organization={isOrganization} />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="h-11 flex-1 rounded-full border bg-muted/50 px-4 text-left text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ¿Qué quieres compartir con la comunidad?
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 pl-14 text-sm font-semibold">
          <button
            type="button"
            className="rounded-full px-3 py-1.5 hover:bg-muted"
            onClick={() => setOpen(true)}
          >
            <span aria-hidden="true">📷</span> Foto
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 hover:bg-muted"
            onClick={() => setOpen(true)}
          >
            <span aria-hidden="true">🎬</span> Video
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva publicación</DialogTitle>
            <DialogDescription>
              Comparte con personas y organizaciones de toda Colombia.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">¿Qué vas a compartir?</legend>
              <div className="flex flex-wrap gap-2">
                {POST_TYPES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={type === value}
                    onClick={() => setType(value)}
                    className={cn(
                      'rounded-full border px-4 py-2 text-left text-sm transition-colors',
                      type === value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input hover:bg-muted',
                    )}
                  >
                    <span className="font-semibold">{TYPE_LABELS[value]}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{TYPE_HINT[type]}</p>
            </fieldset>

            <div className="space-y-1.5">
              <label htmlFor="post-title" className="block text-sm font-semibold">
                Título <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <Input
                id="post-title"
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej.: Un año con Toby"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="post-body" className="block text-sm font-semibold">
                Tu publicación
              </label>
              <textarea
                id="post-body"
                value={body}
                rows={5}
                maxLength={MAX_BODY}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Cuéntalo con tus palabras…"
                className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-[15px] leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p
                className={cn(
                  'text-right text-xs',
                  body.length > MAX_BODY - 100 ? 'text-amber-700' : 'text-muted-foreground',
                )}
              >
                {body.length} / {MAX_BODY}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold" id="post-media-label">
                Fotos o video{' '}
                <span className="font-normal text-muted-foreground">
                  (hasta {COMMUNITY_MEDIA_LIMITS.maxItems} archivos, un video de máx.{' '}
                  {COMMUNITY_MEDIA_LIMITS.maxVideoSeconds} s)
                </span>
              </p>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void addFiles(e.dataTransfer.files);
                }}
                className={cn(
                  'rounded-2xl border-2 border-dashed p-4 text-center transition-colors',
                  dragging ? 'border-primary bg-primary/5' : 'border-input',
                )}
              >
                {picked.length > 0 && (
                  <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {picked.map((item, index) => {
                      const isVideo = mediaKindOf(item.file) === 'video';
                      return (
                        <li
                          key={item.preview}
                          className="relative aspect-square overflow-hidden rounded-xl bg-muted"
                        >
                          {isVideo ? (
                            <video
                              src={`${item.preview}#t=0.5`}
                              muted
                              playsInline
                              preload="metadata"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <img src={item.preview} alt="" className="h-full w-full object-cover" />
                          )}
                          {isVideo && (
                            <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                              🎬 {item.seconds ? formatDuration(item.seconds) : 'Video'}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeAt(index)}
                            aria-label={`Quitar ${item.file.name}`}
                            className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white hover:bg-black"
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <input
                  ref={fileInput}
                  id="post-media"
                  type="file"
                  multiple
                  accept={MEDIA_ACCEPT}
                  aria-labelledby="post-media-label"
                  className="sr-only"
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={picked.length >= COMMUNITY_MEDIA_LIMITS.maxItems}
                  onClick={() => fileInput.current?.click()}
                >
                  {picked.length === 0 ? 'Agregar fotos o un video' : 'Agregar más'}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  o arrástralos hasta aquí.{' '}
                  {hasVideo
                    ? 'El video se comprime solo para que cargue rápido.'
                    : 'JPG, PNG, WebP, MP4, MOV o WebM.'}
                </p>
              </div>
            </div>

            <label
              className="flex items-start gap-3 rounded-2xl border bg-muted/40 p-3 text-sm"
              htmlFor="post-shareable"
            >
              <input
                id="post-shareable"
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={shareable}
                onChange={(e) => setShareable(e.target.checked)}
              />
              <span>
                <span className="font-semibold">Hacerla pública y compartible en redes.</span>{' '}
                <span className="text-muted-foreground">
                  Cualquiera podrá verla sin cuenta, con su foto o video, y compartirla en WhatsApp,
                  Facebook, X o LinkedIn. Si publicas como persona, solo se muestra tu primer
                  nombre. Si en la foto o el video aparecen otras personas (sobre todo menores),
                  asegúrate de tener su permiso. Puedes cambiarlo cuando quieras.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter className="items-center">
            {saving && (
              <p className="mr-auto text-sm text-muted-foreground" role="status">
                {saving}
              </p>
            )}
            <Button variant="outline" disabled={!!saving} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={!!saving} onClick={() => void submit()}>
              {saving ? 'Publicando…' : 'Publicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
