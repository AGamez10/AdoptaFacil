import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import { Button, buttonVariants, EmptyState, Skeleton } from '@adoptafacil/ui';
import { fetchPublicOrganization } from '../api/public-organization';
import { buildDonateHref } from '../components/portal-donate-cta';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; organization: OrganizationPublic }
  | { status: 'not-found' }
  | { status: 'error' };

export interface OrgDonateRedirectPageProps {
  /** Subdominio real del portal (`<sub>.<dominio>/donar`): el slug ya resuelto
   *  por `usePortalSubdomainSlug`, en lugar del parámetro `:slug` de la ruta. */
  slugOverride?: string;
}

/**
 * Destino ESTABLE del QR de donaciones de cada organización (ADR-PAG-002 §QR):
 * `/o/:slug/donar` y, en un subdominio real, `/donar`. Resuelve la organización
 * pública por slug (mismo endpoint que el portal) y entra al flujo de donación
 * ya existente (`/donaciones?organizationId=…`, vía `buildDonateHref`). El QR
 * impreso nunca apunta a la pasarela, así que sigue sirviendo si esta cambia.
 */
export function OrgDonateRedirectPage({ slugOverride }: OrgDonateRedirectPageProps = {}) {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const slug = slugOverride ?? slugParam;
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!slug) {
      setState({ status: 'not-found' });
      return;
    }
    let active = true;
    setState({ status: 'loading' });
    fetchPublicOrganization(slug)
      .then((organization) => {
        if (!active) return;
        setState(organization ? { status: 'ready', organization } : { status: 'not-found' });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [slug, attempt]);

  if (state.status === 'ready') {
    // Si la org aún no recibe donaciones en línea, la página de donación
    // muestra el mensaje "activando sus donaciones" con otras formas de ayudar
    // (nunca un error): el slug viaja para ofrecer volver a su portal.
    return (
      <Navigate
        replace
        to={buildDonateHref({ ...state.organization, slug: state.organization.slug ?? slug })}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        {state.status === 'loading' ? (
          <>
            <Skeleton className="h-40 w-full" data-testid="org-donate-loading" />
            <p className="text-sm text-muted-foreground">Abriendo la página de donación…</p>
          </>
        ) : state.status === 'not-found' ? (
          <EmptyState
            title="Organización no encontrada"
            description="Este enlace no corresponde a ninguna organización activa. Puede que haya cambiado: igual puedes conocer a las mascotas que buscan hogar en AdoptaFácil."
          />
        ) : (
          <EmptyState
            title="No pudimos abrir la página de donación"
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
