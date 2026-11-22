import { Link } from 'react-router-dom';
import { PublicFooter, PublicNavbar, PublicPageBody, PublicPageHero } from '../../../shell/layout';
import { LEGAL_DOCUMENTS, legalPath } from '../model/legal-content';

/** `/legal`: todos los documentos legales vigentes y cómo contactarnos. */
export function LegalIndexPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="flex-1">
        <PublicPageHero
          eyebrow="Transparencia"
          tone="cream"
          title="Legal y privacidad"
          lead="Lo que aceptas al usar AdoptaFácil, cómo tratamos tus datos y hasta dónde llega la plataforma. Cada documento muestra su versión y guardamos cuál aceptaste y cuándo."
        />
        <PublicPageBody narrow className="space-y-8">
          <ul className="divide-y divide-[var(--af-line)] overflow-hidden rounded-[var(--af-r-card)] border border-[var(--af-line)] bg-card shadow-[var(--af-shadow-card)]">
            {LEGAL_DOCUMENTS.map((doc) => (
              <li
                key={doc.key}
                className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link
                  to={legalPath(doc.slug)}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {doc.title}
                </Link>
                <span className="text-xs text-muted-foreground">
                  Versión {doc.version}
                  {doc.draft ? ' · borrador en revisión legal' : ''}
                </span>
              </li>
            ))}
          </ul>
          <section className="space-y-2 text-sm">
            <h2 className="text-lg font-semibold">Tus datos y reportes</h2>
            <p>
              Para consultar, corregir o suprimir tus datos personales, o para reportar maltrato
              animal o contenido ilegal, escribe a{' '}
              <a
                href="mailto:adoptafacil.oficial@gmail.com"
                className="text-primary underline underline-offset-2"
              >
                adoptafacil.oficial@gmail.com
              </a>
              . Si un animal está en peligro inmediato, llama primero a la línea 123.
            </p>
          </section>
        </PublicPageBody>
      </main>
      <PublicFooter />
    </div>
  );
}
