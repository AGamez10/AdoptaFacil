import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { PublicQrResolution } from '@adoptafacil/contracts';
import { Button, buttonVariants, EmptyState, Skeleton } from '@adoptafacil/ui';
import { useFeature } from '../../../shell/capabilities';
import { resolveOrganizationQr } from '../api/org-qr';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; resolution: PublicQrResolution }
  | { status: 'not-found' }
  | { status: 'error' };

/**
 * Ruta interna a la que lleva el destino validado. Solo rutas propias de la
 * app, armadas aquí a partir de tipo + id: nunca una URL recibida, así que no
 * hay redirección abierta. Sin el módulo de pagos, "donar" lleva al perfil.
 */
export function qrDestinationPath(
  { slug, target }: PublicQrResolution,
  paymentsEnabled: boolean,
): string {
  const portal = `/o/${encodeURIComponent(slug)}`;
  switch (target.kind) {
    case 'campaign':
      return target.id ? `/campanas/${encodeURIComponent(target.id)}` : portal;
    case 'animal':
      return target.id ? `${portal}/animales/${encodeURIComponent(target.id)}` : portal;
    case 'donate':
      return paymentsEnabled ? `${portal}/donar` : portal;
    default:
      return portal;
  }
}

/**
 * `/q/:code` — el QR FIJO de una organización. La etiqueta impresa nunca
 * cambia; la organización elige desde su panel a dónde lleva (perfil, donar,
 * una campaña o apadrinar un animal) y la API valida ese destino en cada
 * escaneo (si dejó de valer, lleva a donar a la misma organización).
 */
export function OrgQrRedirectPage() {
  const { code } = useParams<{ code: string }>();
  const payments = useFeature('payments');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!code) {
      setState({ status: 'not-found' });
      return;
    }
    let active = true;
    setState({ status: 'loading' });
    resolveOrganizationQr(code)
      .then((resolution) => {
        if (!active) return;
        setState(resolution ? { status: 'ready', resolution } : { status: 'not-found' });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [code, attempt]);

  if (state.status === 'ready') {
    return <Navigate replace to={qrDestinationPath(state.resolution, payments)} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        {state.status === 'loading' ? (
          <>
            <Skeleton className="h-40 w-full" data-testid="org-qr-loading" />
            <p className="text-sm text-muted-foreground">Abriendo…</p>
          </>
        ) : state.status === 'not-found' ? (
          <EmptyState
            title="Código no encontrado"
            description="Este código QR no corresponde a ninguna organización activa. Igual puedes conocer a las mascotas que buscan hogar en AdoptaFácil."
          />
        ) : (
          <EmptyState
            title="No pudimos abrir este código"
            description="Puede ser la conexión a internet. Inténtalo de nuevo en un momento."
          />
        )}
        {state.status === 'error' && (
          <Button onClick={() => setAttempt((n) => n + 1)}>Intentar de nuevo</Button>
        )}
        {state.status !== 'loading' && (
          <Link to="/" className={buttonVariants({ variant: 'outline' })}>
            Ver mascotas en adopción
          </Link>
        )}
      </div>
    </main>
  );
}
