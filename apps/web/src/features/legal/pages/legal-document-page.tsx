import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { LegalMarkdown } from '../components/legal-markdown';
import { getLegalContent, legalPath, listLegalVersions } from '../model/legal-content';

/**
 * Página pública de un documento legal: `/legal/:slug` (versión vigente) o
 * `/legal/:slug/:version` (cualquier versión publicada, para releer
 * exactamente lo que se aceptó). Sin sesión.
 */
export function LegalDocumentPage() {
  const { slug = '', version } = useParams();
  const content = getLegalContent(slug, version);
  const versions = listLegalVersions(slug);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        {content ? (
          <article className="space-y-6">
            <p className="text-xs text-muted-foreground">
              <Link to="/legal" className="underline underline-offset-2">
                Legal
              </Link>{' '}
              · Versión {content.version}
              {content.isCurrent ? ' (vigente)' : ''}
            </p>
            {!content.isCurrent && (
              <p role="note" className="rounded-md border border-border bg-muted p-3 text-sm">
                Esta no es la versión vigente.{' '}
                <Link to={legalPath(slug)} className="underline underline-offset-2">
                  Ver la versión vigente
                </Link>
                .
              </p>
            )}
            <LegalMarkdown markdown={content.markdown} />
            {versions.length > 1 && (
              <nav
                aria-label="Versiones publicadas"
                className="border-t border-border pt-4 text-sm"
              >
                <p className="mb-2 font-medium">Versiones publicadas</p>
                <ul className="space-y-1">
                  {versions.map((v) => (
                    <li key={v}>
                      <Link to={legalPath(slug, v)} className="underline underline-offset-2">
                        {v}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </article>
        ) : (
          <EmptyState
            title="Documento no encontrado"
            description="Revisa la lista de documentos legales de AdoptaFácil."
          />
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
