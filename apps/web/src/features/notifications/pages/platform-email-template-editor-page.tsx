import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  EMAIL_ACCENT_COLORS,
  EMAIL_ICONS,
  Role,
  type EmailPreview,
  type EmailTemplateContent,
  type EmailTemplateDetail,
  type SendTestEmailResult,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { ApiError, useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import {
  ACCENT_COLOR_LABELS,
  CATEGORY_LABELS,
  FIELD_HELP,
  THEME_ICONS,
} from '../lib/email-template-labels';

type Field = Exclude<keyof EmailTemplateContent, 'accentColor' | 'icon'>;

const FIELDS: Array<{ key: Field; label: string; multiline?: boolean; max: number }> = [
  { key: 'subject', label: 'Asunto', max: 150 },
  { key: 'preheader', label: 'Texto de vista previa', max: 200 },
  { key: 'heading', label: 'Título', max: 120 },
  { key: 'body', label: 'Mensaje', multiline: true, max: 5000 },
  { key: 'ctaLabel', label: 'Texto del botón', max: 40 },
  { key: 'footerNote', label: 'Nota al pie', multiline: true, max: 300 },
];

function errorList(error: unknown): string[] {
  if (error instanceof ApiError) {
    const details = error.details as { errors?: unknown; message?: unknown } | undefined;
    if (Array.isArray(details?.errors)) return details.errors.map(String);
    if (Array.isArray(details?.message)) return details.message.map(String);
    return [error.message];
  }
  return ['Inténtalo de nuevo.'];
}

/**
 * `/plataforma/correos/:event` — edit one email's copy with a live preview.
 * The preview is rendered by the API (same code that sends the real email)
 * inside a sandboxed iframe with scripts disabled. Saving creates a new
 * version; activating it makes real emails use it; any older version (or the
 * original copy) can be restored in one click.
 */
export function PlatformEmailTemplateEditorPage() {
  const { event = '' } = useParams<{ event: string }>();
  const client = useApiClient();
  const { hasRole } = useSession();
  const canView = hasRole(Role.PlatformAdmin) || hasRole(Role.PlatformSuperAdmin);
  const { toast } = useToast();

  const [detail, setDetail] = useState<EmailTemplateDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<EmailTemplateContent | null>(null);
  const [changeNote, setChangeNote] = useState('');
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<'desk' | 'mob'>('desk');
  const lastField = useRef<{ key: Field; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);

  const path = `/platform/email-templates/${encodeURIComponent(event)}`;

  const load = useCallback(async () => {
    const d = await client.request<EmailTemplateDetail>(path);
    setDetail(d);
    setDraft({ ...d.activeContent });
  }, [client, path]);

  useEffect(() => {
    if (!canView) return;
    load().catch(() => setLoadFailed(true));
  }, [load, canView]);

  // Live preview, debounced; validation errors show inline instead of a broken preview.
  useEffect(() => {
    if (!draft) return;
    const handle = window.setTimeout(() => {
      client
        .request<EmailPreview>(`${path}/preview`, { method: 'POST', json: { content: draft } })
        .then((p) => {
          setPreview(p);
          setErrors([]);
        })
        .catch((error) => setErrors(errorList(error)));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [client, path, draft]);

  const insertVariable = (name: string) => {
    if (!draft) return;
    const token = `{{${name}}}`;
    const target = lastField.current;
    const key: Field = target?.key ?? 'body';
    const current = draft[key] ?? '';
    const el = target?.el;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    setDraft({ ...draft, [key]: next });
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (error) {
      const list = errorList(error);
      setErrors(list);
      toast({ title: 'No se pudo completar', description: list[0], variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const save = (activate: boolean) =>
    run(activate ? 'activate' : 'save', async () => {
      const d = await client.request<EmailTemplateDetail>(`${path}/versions`, {
        method: 'POST',
        json: { ...draft, changeNote: changeNote || undefined, activate },
      });
      setDetail(d);
      setChangeNote('');
      toast({
        title: activate
          ? `Versión ${d.latestVersion} activa`
          : `Versión ${d.latestVersion} guardada`,
        description: activate
          ? 'Los próximos correos ya salen con este texto.'
          : 'Quedó como borrador. Actívala cuando quieras.',
        variant: 'success',
      });
    });

  const activate = (version: number | null) =>
    run(`v${version}`, async () => {
      const d = await client.request<EmailTemplateDetail>(`${path}/active`, {
        method: 'PUT',
        json: { version },
      });
      setDetail(d);
      setDraft({ ...d.activeContent });
      toast({
        title: version ? `Versión ${version} activa` : 'Texto original restaurado',
        variant: 'success',
      });
    });

  const toggle = () =>
    run('toggle', async () => {
      if (!detail) return;
      const d = await client.request<EmailTemplateDetail>(`${path}/enabled`, {
        method: 'PUT',
        json: { enabled: !detail.enabled },
      });
      setDetail(d);
      toast({
        title: d.enabled ? 'Correo encendido' : 'Correo apagado',
        description: d.enabled ? undefined : 'No se enviará hasta que lo vuelvas a encender.',
        variant: d.enabled ? 'success' : 'info',
      });
    });

  const testSend = () =>
    run('test', async () => {
      const r = await client.request<SendTestEmailResult>(`${path}/test-send`, {
        method: 'POST',
        json: { content: draft },
      });
      toast({
        title: 'Prueba enviada',
        description: `Revisa tu bandeja: ${r.sentTo}`,
        variant: 'success',
      });
    });

  if (!canView) {
    return (
      <PageContainer>
        <PageHeader title="Correos" description="Acceso restringido." />
        <EmptyState title="Sin acceso" description="No tienes permisos de plataforma." />
      </PageContainer>
    );
  }
  if (loadFailed) {
    return (
      <PageContainer>
        <PageHeader title="Correos" />
        <EmptyState
          title="No encontramos este correo"
          description="Vuelve a la lista e inténtalo de nuevo."
        />
      </PageContainer>
    );
  }
  if (!detail || !draft) {
    return (
      <PageContainer>
        <Skeleton className="h-[600px] w-full" />
      </PageContainer>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(detail.activeContent);

  return (
    <PageContainer>
      <Link
        to="/plataforma/correos"
        className="mb-3 inline-block text-sm text-primary hover:underline"
      >
        ← Todos los correos
      </Link>
      <PageHeader
        title={`${THEME_ICONS[detail.theme]} ${detail.label}`}
        description={`${detail.description} Para: ${detail.audience}.`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge variant={detail.category === 'bulk' ? 'warning' : 'outline'}>
          {CATEGORY_LABELS[detail.category].title}
        </Badge>
        {detail.required ? (
          <Badge variant="info">Obligatorio: no se puede apagar</Badge>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={detail.enabled}
            onClick={() => void toggle()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 text-sm font-medium"
            data-testid="email-enabled-switch"
          >
            <span
              aria-hidden
              className={`relative inline-block shrink-0 rounded-full transition-colors ${detail.enabled ? 'bg-primary' : 'bg-muted-foreground/40'}`}
              style={{ width: 44, height: 24 }}
            >
              <span
                className="absolute rounded-full bg-white shadow transition-[left]"
                style={{ top: 2, width: 20, height: 20, left: detail.enabled ? 22 : 2 }}
              />
            </span>
            {detail.enabled ? 'Encendido' : 'Apagado'}
          </button>
        )}
        <span className="text-sm text-muted-foreground">
          En uso: {detail.activeVersion ? `versión ${detail.activeVersion}` : 'texto original'}
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Texto del correo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium">Datos que puedes insertar</p>
              <div className="flex flex-wrap gap-2">
                {detail.variables.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => insertVariable(v.name)}
                    title={`Ejemplo: ${v.example}`}
                    className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium hover:border-primary hover:text-primary"
                  >
                    {v.label} <code className="ml-1 text-muted-foreground">{`{{${v.name}}}`}</code>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Haz clic para insertarlo donde está el cursor. Los enlaces los pone AdoptaFácil; el
                color y el ícono los eliges abajo.
              </p>
            </div>

            {FIELDS.filter((f) => f.key !== 'ctaLabel' || detail.ctaUrlVariable).map((f) => {
              const id = `email-field-${f.key}`;
              const value = draft[f.key] ?? '';
              const common = {
                id,
                value,
                maxLength: f.max,
                onFocus: (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
                  lastField.current = { key: f.key, el: e.currentTarget };
                },
                onChange: (e: { target: { value: string } }) =>
                  setDraft({ ...draft, [f.key]: e.target.value }),
                className:
                  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary',
                'aria-describedby': `${id}-help`,
              };
              return (
                <div key={f.key}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <label htmlFor={id} className="text-sm font-medium">
                      {f.label}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {value.length}/{f.max}
                    </span>
                  </div>
                  {f.multiline ? (
                    <textarea rows={f.key === 'body' ? 9 : 3} {...common} />
                  ) : (
                    <input type="text" {...common} />
                  )}
                  <p id={`${id}-help`} className="mt-1 text-xs text-muted-foreground">
                    {FIELD_HELP[f.key]}
                  </p>
                </div>
              );
            })}

            <fieldset>
              <legend className="mb-1 text-sm font-medium">Color del correo</legend>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={!draft.accentColor}
                  onClick={() => setDraft({ ...draft, accentColor: undefined })}
                  className="rounded-full border border-border px-3 py-1 text-xs aria-pressed:border-primary aria-pressed:font-semibold"
                >
                  Del tema
                </button>
                {EMAIL_ACCENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={draft.accentColor === c}
                    onClick={() => setDraft({ ...draft, accentColor: c })}
                    className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs aria-pressed:border-primary aria-pressed:font-semibold"
                  >
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: ACCENT_COLOR_LABELS[c].hex }}
                    />
                    {ACCENT_COLOR_LABELS[c].label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1 text-sm font-medium">Ícono</legend>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={!draft.icon}
                  onClick={() => setDraft({ ...draft, icon: undefined })}
                  className="rounded-full border border-border px-3 py-1 text-xs aria-pressed:border-primary aria-pressed:font-semibold"
                >
                  Del tema ({THEME_ICONS[detail.theme]})
                </button>
                {EMAIL_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    aria-label={`Ícono ${icon}`}
                    aria-pressed={draft.icon === icon}
                    onClick={() => setDraft({ ...draft, icon })}
                    className="rounded-full border border-border px-2 py-1 text-base aria-pressed:border-primary"
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="email-change-note" className="mb-1 block text-sm font-medium">
                ¿Qué cambiaste?{' '}
                <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="email-change-note"
                type="text"
                maxLength={200}
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="Ej.: tono más cálido para Navidad"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            {errors.length > 0 && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <ul className="list-disc space-y-1 pl-5">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void save(true)}
                disabled={busy !== null || errors.length > 0 || !dirty}
              >
                {busy === 'activate' ? 'Guardando…' : 'Guardar y activar'}
              </Button>
              <Button
                variant="outline"
                onClick={() => void save(false)}
                disabled={busy !== null || errors.length > 0 || !dirty}
              >
                Guardar borrador
              </Button>
              <Button
                variant="ghost"
                onClick={() => void testSend()}
                disabled={busy !== null || errors.length > 0}
              >
                {busy === 'test' ? 'Enviando…' : 'Enviarme una prueba'}
              </Button>
              {dirty && (
                <Button
                  variant="ghost"
                  onClick={() => setDraft({ ...detail.activeContent })}
                  disabled={busy !== null}
                >
                  Descartar cambios
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>Vista previa</CardTitle>
              <div
                className="inline-flex rounded-lg border border-border p-0.5 text-xs"
                role="group"
                aria-label="Tamaño de la vista previa"
              >
                {(['desk', 'mob'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={`rounded-md px-3 py-1 ${view === v ? 'bg-primary text-primary-foreground' : ''}`}
                  >
                    {v === 'desk' ? 'Computador' : 'Celular'}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {preview ? (
                <>
                  <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
                    <p className="font-semibold">{preview.subject}</p>
                    <p className="truncate text-muted-foreground">{preview.preheader}</p>
                  </div>
                  <div className="flex justify-center rounded-lg bg-muted/40 p-2">
                    <iframe
                      title="Vista previa del correo"
                      srcDoc={preview.html}
                      sandbox=""
                      className="h-[720px] rounded-md border border-border bg-white transition-[width]"
                      style={{ width: view === 'desk' ? '100%' : 380 }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Con datos de ejemplo. Así se verá en Gmail, Outlook y el celular.
                  </p>
                </>
              ) : (
                <Skeleton className="h-[720px] w-full" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial de versiones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <span>
                  <span className="font-medium">Texto original</span>
                  <span className="block text-xs text-muted-foreground">
                    El que trae AdoptaFácil
                  </span>
                </span>
                {detail.activeVersion === null ? (
                  <Badge variant="success">En uso</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void activate(null)}
                  >
                    Restaurar
                  </Button>
                )}
              </div>
              {detail.versions.map((v) => (
                <div
                  key={v.version}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="font-medium">Versión {v.version}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString('es-CO', {
                        timeZone: 'America/Bogota',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      {v.changeNote ? ` · ${v.changeNote}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          subject: v.subject,
                          preheader: v.preheader,
                          heading: v.heading,
                          body: v.body,
                          ...(v.ctaLabel ? { ctaLabel: v.ctaLabel } : {}),
                          ...(v.footerNote ? { footerNote: v.footerNote } : {}),
                          ...(v.accentColor ? { accentColor: v.accentColor } : {}),
                          ...(v.icon ? { icon: v.icon } : {}),
                        })
                      }
                    >
                      Ver
                    </Button>
                    {detail.activeVersion === v.version ? (
                      <Badge variant="success">En uso</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void activate(v.version)}
                      >
                        Activar
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
