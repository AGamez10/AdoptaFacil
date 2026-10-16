import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import { buttonVariants, EmptyState, Skeleton } from '@adoptafacil/ui';
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
  }, [slug]);

  if (state.status === 'ready') {
    return <Navigate replace to={buildDonateHref(state.organization)} />;
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
            description="Este enlace de donación no corresponde a ninguna organización activa."
          />
        ) : (
          <EmptyState
            title="No pudimos abrir la página de donación"
            description="Revisa tu conexión y vuelve a escanear el código o recarga la página."
          />
        )}
        {state.status !== 'loading' && (
          <Link to="/" className={buttonVariants({ variant: 'outline' })}>
            Ir a AdoptaFácil
          </Link>
        )}
      </div>
    </main>
  );
}
