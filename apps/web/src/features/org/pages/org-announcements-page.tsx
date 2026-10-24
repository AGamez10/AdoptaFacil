import { useCallback, useEffect, useState } from 'react';
import {
  ANNOUNCEMENT_AUDIENCES,
  ORG_ANNOUNCEMENT_DAILY_LIMIT,
  type AnnouncementAudience,
  type OrgAnnouncementAudience,
  type SendOrgAnnouncementResult,
} from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Skeleton,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { ApiError, useApiClient } from '../../../shell/api';

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  donors: 'Personas que han donado',
  adopters: 'Personas que pidieron adoptar',
  volunteers: 'Voluntarios',
};

/**
 * `/organizacion/anuncios` — urgent announcement to the organization's own
 * contacts (Owner/Administrator, same roles as the API). Each email carries
 * a link to stop receiving this organization's emails; people who opted out
 * are never counted nor written to.
 */
export function OrgAnnouncementsPage() {
  const client = useApiClient();
  const [audience, setAudience] = useState<OrgAnnouncementAudience | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<AnnouncementAudience[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<number | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    client
      .request<OrgAnnouncementAudience>('/org/announcements/audience')
      .then(setAudience)
      .catch(() => setFailed(true));
  }, [client]);

  useEffect(load, [load]);

  if (failed) {
    return (
      <PageContainer>
        <PageHeader title="Anuncios urgentes" />
        <ErrorState description="No pudimos cargar tus contactos." onRetry={load} />
      </PageContainer>
    );
  }
  if (!audience) {
    return (
      <PageContainer>
        <PageHeader title="Anuncios urgentes" />
        <Skeleton className="h-40 w-full" />
      </PageContainer>
    );
  }

  const valid = selected.length > 0 && title.trim().length >= 3 && message.trim().length >= 10;
  const toggle = (a: AnnouncementAudience) =>
    setSelected((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await client.request<SendOrgAnnouncementResult>('/org/announcements', {
        method: 'POST',
        json: { audiences: selected, title: title.trim(), message: message.trim() },
      });
      setResult(res.recipients);
      setTitle('');
      setMessage('');
      setSelected([]);
      load();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 429
          ? `Ya enviaste ${ORG_ANNOUNCEMENT_DAILY_LIMIT} anuncios en las últimas 24 horas.`
          : 'No pudimos enviar el anuncio. Inténtalo de nuevo.',
      );
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Anuncios urgentes"
        description="Escribe a tus donantes, adoptantes y voluntarios cuando algo no puede esperar."
      />
      {result !== null && (
        <p role="status" className="mb-4 rounded-lg bg-muted p-3 text-sm">
          Listo: el anuncio va en camino a {result} {result === 1 ? 'persona' : 'personas'}.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Nuevo anuncio</CardTitle>
          <CardDescription>
            Te quedan {audience.remainingToday} de {ORG_ANNOUNCEMENT_DAILY_LIMIT} anuncios por hoy.
            Cada correo incluye un enlace para dejar de recibir los de tu organización.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">¿A quién le escribes?</legend>
            <div className="space-y-2">
              {ANNOUNCEMENT_AUDIENCES.map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(a)}
                    onChange={() => toggle(a)}
                  />
                  {AUDIENCE_LABELS[a]} ({audience[a]})
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="announcement-title" className="mb-1 block text-sm font-medium">
              Título
            </label>
            <input
              id="announcement-title"
              type="text"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/[\r\n]/g, ' '))}
              placeholder="Ej.: Necesitamos hogar temporal para 5 cachorros"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="announcement-message" className="mb-1 block text-sm font-medium">
              Mensaje
            </label>
            <textarea
              id="announcement-message"
              rows={6}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">¿Enviar ahora? No se puede deshacer.</span>
              <Button onClick={() => void send()} disabled={sending}>
                {sending ? 'Enviando…' : 'Sí, enviar'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={sending}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setConfirming(true)}
              disabled={!valid || audience.remainingToday === 0}
            >
              Revisar y enviar
            </Button>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
