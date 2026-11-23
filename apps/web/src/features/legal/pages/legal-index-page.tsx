import { Link } from 'react-router-dom';
import { LEGAL_CONTROLLER } from '@adoptafacil/contracts';
import { PublicFooter, PublicNavbar, PublicPageBody, PublicPageHero } from '../../../shell/layout';
import { LEGAL_DOCUMENTS, legalPath } from '../model/legal-path';

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
          <section className="space-y-2 text-sm" data-testid="legal-operator">
            <h2 className="text-lg font-semibold">Quién opera AdoptaFácil</h2>
            <p>
              AdoptaFácil es un servicio de software. Lo opera y es responsable del tratamiento de
              tus datos:
            </p>
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">Titular</dt>
              <dd>
                {LEGAL_CONTROLLER.name}
                {LEGAL_CONTROLLER.kind === 'natural_person' ? ', persona natural' : ''}
              </dd>
              <dt className="text-muted-foreground">NIT</dt>
              <dd>{LEGAL_CONTROLLER.nit}</dd>
              {LEGAL_CONTROLLER.economicActivity && (
                <>
                  <dt className="text-muted-foreground">Actividad (RUT)</dt>
                  <dd>
                    {LEGAL_CONTROLLER.economicActivity.ciiu} ·{' '}
                    {LEGAL_CONTROLLER.economicActivity.description}
                  </dd>
                </>
              )}
              {LEGAL_CONTROLLER.taxResponsibilities && (
                <>
                  <dt className="text-muted-foreground">Responsabilidad tributaria</dt>
                  <dd>
                    {LEGAL_CONTROLLER.taxResponsibilities
                      .map((r) => `${r.code} · ${r.description}`)
                      .join('; ')}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Dirección</dt>
              <dd>{LEGAL_CONTROLLER.address}</dd>
              <dt className="text-muted-foreground">Teléfono</dt>
              <dd>{LEGAL_CONTROLLER.phone}</dd>
              <dt className="text-muted-foreground">Correo</dt>
              <dd>{LEGAL_CONTROLLER.email}</dd>
            </dl>
            <p className="text-muted-foreground">
              Las donaciones no pasan por AdoptaFácil: van directo a la cuenta de Mercado Pago de
              cada refugio, que es quien las recibe. AdoptaFácil solo cobra por su propio servicio
              de software (los planes opcionales).
            </p>
          </section>
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
