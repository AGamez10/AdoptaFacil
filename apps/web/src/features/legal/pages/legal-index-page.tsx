import { Link } from 'react-router-dom';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { LEGAL_DOCUMENTS, legalPath } from '../model/legal-content';

/** `/legal`: todos los documentos legales vigentes y cómo contactarnos. */
export function LegalIndexPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-10 sm:px-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Legal y privacidad</h1>
          <p className="text-sm text-muted-foreground">
            Lo que aceptas al usar AdoptaFácil, cómo tratamos tus datos y hasta dónde llega la
            plataforma. Cada documento muestra su versión y guardamos cuál aceptaste y cuándo.
          </p>
        </header>
        <ul className="divide-y divide-border rounded-md border border-border">
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
      </main>
      <PublicFooter />
    </div>
  );
}
