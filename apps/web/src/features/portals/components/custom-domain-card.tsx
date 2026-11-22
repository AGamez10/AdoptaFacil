import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  PORTAL_DOMAIN_CHECK_ERRORS,
  type PortalDomainView,
  type SetPortalDomainInput,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { ApiError, useApiClient } from '../../../shell/api';

const colombiaDateTime = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

const STATE_BADGE: Record<
  PortalDomainView['state'],
  { label: string; variant: 'success' | 'warning' | 'outline' | 'secondary' }
> = {
  none: { label: 'Sin dominio', variant: 'outline' },
  pending_dns: { label: 'Esperando el DNS', variant: 'warning' },
  active: { label: 'Activo', variant: 'success' },
  suspended: { label: 'En pausa', variant: 'secondary' },
  unavailable: { label: 'Próximamente', variant: 'secondary' },
};

/**
 * Dominio propio del portal (Pro). La organización compra su dominio donde
 * quiera (queda a su nombre), escribe aquí cuál es, crea los dos registros
 * DNS que le mostramos y pulsa "Verificar". Con el DNS correcto el portal
 * responde en su dominio y el HTTPS se pone solo.
 */
export function CustomDomainCard({
  onActiveDomain,
}: {
  /** El dominio activo (o null), para que la vista previa muestre la dirección real. */
  onActiveDomain?: (domain: string | null) => void;
}) {
  const client = useApiClient();
  const { toast } = useToast();
  const [view, setView] = useState<PortalDomainView | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'save' | 'verify' | 'remove' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const apply = useCallback(
    (next: PortalDomainView) => {
      setView(next);
      onActiveDomain?.(next.state === 'active' ? next.domain : null);
    },
    [onActiveDomain],
  );

  useEffect(() => {
    client
      .request<PortalDomainView>('/org/portal/domain')
      .then((next) => {
        // Una respuesta inesperada (API vieja, proxy) no rompe la página del portal.
        if (next && typeof next === 'object' && next.state in STATE_BADGE) apply(next);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [client, apply]);

  const run = async (kind: 'save' | 'verify' | 'remove', call: () => Promise<PortalDomainView>) => {
    setBusy(kind);
    try {
      const next = await call();
      apply(next);
      if (kind === 'verify') {
        toast(
          next.state === 'active'
            ? {
                title: '¡Tu dominio quedó conectado!',
                description: `Tu portal ya responde en https://${next.domain}`,
              }
            : {
                title: 'Aún no está listo',
                description: next.lastError
                  ? PORTAL_DOMAIN_CHECK_ERRORS[next.lastError]
                  : 'Revisa los registros DNS.',
                variant: 'warning',
              },
        );
      }
      if (kind === 'save') setDraft('');
    } catch (error) {
      toast({
        title: error instanceof ApiError ? error.message : 'No pudimos guardar el cambio',
        description: 'Intenta de nuevo en unos minutos.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
      setConfirmRemove(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    void run('save', () =>
      client.request<PortalDomainView>('/org/portal/domain', {
        method: 'PUT',
        json: { domain: draft } satisfies SetPortalDomainInput,
      }),
    );
  };

  if (failed) return null;

  return (
    <Card data-testid="custom-domain-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Tu dominio propio</CardTitle>
          {view && (
            <Badge variant={STATE_BADGE[view.state].variant}>{STATE_BADGE[view.state].label}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Muestra tu portal en tu propia dirección, como www.turefugio.org. Compras el dominio donde
          prefieras (queda a nombre de tu organización) y nosotros lo conectamos con HTTPS.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!view && <Skeleton className="h-24 w-full" />}

        {view?.state === 'unavailable' && (
          <p>Estamos habilitando los dominios propios. Te avisaremos cuando puedas conectarlo.</p>
        )}

        {view &&
          view.state !== 'unavailable' &&
          !view.planIncludes &&
          view.state !== 'suspended' && (
            <p>
              El dominio propio es parte del plan Pro.{' '}
              <Link to="/organizacion/plan" className="font-semibold underline">
                Ver planes
              </Link>
            </p>
          )}

        {view?.state === 'suspended' && (
          <p data-testid="custom-domain-suspended">
            Tu plan actual no incluye dominio propio, así que <strong>{view.domain}</strong> está en
            pausa: tu portal sigue en su enlace de AdoptaFácil. Vuelve a funcionar solo cuando
            renueves Pro.{' '}
            <Link to="/organizacion/plan" className="font-semibold underline">
              Renovar
            </Link>
          </p>
        )}

        {view?.state === 'active' && (
          <p>
            Tu portal responde en{' '}
            <a
              href={`https://${view.domain}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              https://{view.domain}
            </a>
            {view.verifiedAt && ` desde el ${colombiaDateTime.format(new Date(view.verifiedAt))}`}.
          </p>
        )}

        {view?.state === 'pending_dns' && (
          <div className="space-y-3" data-testid="custom-domain-pending">
            <p>
              Entra al panel donde compraste <strong>{view.domain}</strong> (GoDaddy, Hostinger,
              Namecheap, Cloudflare…) y crea estos dos registros DNS. Pueden tardar desde unos
              minutos hasta unas horas en verse.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-1 pr-3">Tipo</th>
                    <th className="py-1 pr-3">Nombre / host</th>
                    <th className="py-1">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {view.records.map((record) => (
                    <tr key={record.type} className="border-t align-top">
                      <td className="py-2 pr-3 font-semibold">{record.type}</td>
                      <td className="break-all py-2 pr-3 font-mono">{record.name}</td>
                      <td className="break-all py-2 font-mono">{record.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Si tu registrador completa el dominio solo, escribe en “Nombre” solo la primera parte
              (por ejemplo <span className="font-mono">www</span> o{' '}
              <span className="font-mono">_adoptafacil.www</span>). Si usas Cloudflare, deja el
              registro en “Solo DNS” (nube gris).
            </p>
            {view.lastError && (
              <p
                className="rounded-md bg-[var(--af-sun-soft)] p-2 text-[var(--af-ink)]"
                role="status"
              >
                {PORTAL_DOMAIN_CHECK_ERRORS[view.lastError]}
                {view.lastCheckedAt &&
                  ` (revisado el ${colombiaDateTime.format(new Date(view.lastCheckedAt))})`}
              </p>
            )}
          </div>
        )}

        {view && view.planIncludes && view.state !== 'unavailable' && (
          <div className="flex flex-wrap gap-2">
            {(view.state === 'pending_dns' || view.state === 'active') && (
              <Button
                onClick={() =>
                  run('verify', () =>
                    client.request<PortalDomainView>('/org/portal/domain/verify', {
                      method: 'POST',
                    }),
                  )
                }
                disabled={busy !== null}
                variant={view.state === 'active' ? 'outline' : 'default'}
                data-testid="custom-domain-verify"
              >
                {busy === 'verify'
                  ? 'Revisando el DNS…'
                  : view.state === 'active'
                    ? 'Revisar de nuevo'
                    : 'Ya los creé, verificar'}
              </Button>
            )}
            {view.domain &&
              (confirmRemove ? (
                <>
                  <Button
                    variant="dark"
                    disabled={busy !== null}
                    onClick={() =>
                      run('remove', () =>
                        client.request<PortalDomainView>('/org/portal/domain', {
                          method: 'DELETE',
                        }),
                      )
                    }
                  >
                    Sí, desconectar
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
                    No
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmRemove(true)}>
                  Desconectar dominio
                </Button>
              ))}
          </div>
        )}

        {view && view.planIncludes && (view.state === 'none' || view.state === 'pending_dns') && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={save}>
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
              <span className="font-medium">
                {view.state === 'none' ? 'Tu dominio' : 'Cambiar por otro dominio'}
              </span>
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="www.turefugio.org"
                autoComplete="off"
                inputMode="url"
                data-testid="custom-domain-input"
              />
            </label>
            <Button type="submit" disabled={busy !== null || !draft.trim()}>
              {busy === 'save' ? 'Guardando…' : 'Conectar'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
