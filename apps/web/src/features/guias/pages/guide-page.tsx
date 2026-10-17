import { Link, Navigate, useParams } from 'react-router-dom';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { findGuide, GUIDES, guidePath, type GuideLink } from '../../../seo/guides';
import { articleLd, breadcrumbLd, faqLd, useSeo } from '../../../seo/seo';
import styles from './guides.module.scss';

function Links({ links }: { links?: GuideLink[] }) {
  if (!links?.length) return null;
  return (
    <p className={styles.article__links}>
      {links.map((link) => (
        <Link key={link.to} to={link.to} className={styles.article__cta}>
          {link.label} →
        </Link>
      ))}
    </p>
  );
}

/** Guía pública (/guias/:slug) con preguntas frecuentes y datos estructurados. */
export function GuidePage() {
  const { slug } = useParams();
  const guide = findGuide(slug);
  const path = guide ? guidePath(guide.slug) : '/guias';

  useSeo({
    title: guide?.title,
    description: guide?.description,
    path,
    type: 'article',
    jsonLd: guide
      ? [
          articleLd({ ...guide, path }),
          faqLd(guide.faq),
          breadcrumbLd([
            { name: 'Inicio', path: '/' },
            { name: 'Guías', path: '/guias' },
            { name: guide.title, path },
          ]),
        ]
      : [],
  });

  if (!guide) return <Navigate to="/guias" replace />;
  const others = GUIDES.filter((item) => item.slug !== guide.slug).slice(0, 3);
  const updated = new Date(`${guide.updated}T12:00:00Z`).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  });

  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-[var(--af-ink)]">
      <PublicNavbar />
      <main className="flex-1">
        <article className={styles.article}>
          <div className={styles.narrow}>
            <nav aria-label="Ruta de navegación">
              <ol className={styles.crumbs}>
                <li>
                  <Link to="/">Inicio</Link>
                </li>
                <li>
                  <Link to="/guias">Guías</Link>
                </li>
                <li>
                  <span aria-current="page">{guide.title}</span>
                </li>
              </ol>
            </nav>
            <h1 className={styles.article__title}>{guide.title}</h1>
            <p className={styles.article__meta}>Actualizada el {updated}</p>
            <p className={styles.article__intro}>{guide.intro}</p>

            {guide.sections.map((section) => (
              <section key={section.heading} className={styles.article__section}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                <Links links={section.links} />
              </section>
            ))}
            <Links links={guide.links} />

            <section className={styles.faq} aria-labelledby="faq-title">
              <h2 id="faq-title">Preguntas frecuentes</h2>
              {guide.faq.map((item) => (
                <details key={item.q} className={styles.faq__item}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </section>

            <aside className={styles.callout}>
              <p className={styles.callout__title}>¿Listo para conocerlos?</p>
              <p>Perros y gatos de organizaciones de todo el país esperan un hogar.</p>
              <Link to="/adoptar/perros" className={styles.callout__button}>
                Ver perros en adopción
              </Link>
            </aside>
          </div>
        </article>

        {others.length > 0 && (
          <section className={styles.more} aria-labelledby="more-guides">
            <div className={styles.container}>
              <h2 id="more-guides" className={styles.more__title}>
                Sigue leyendo
              </h2>
              <ul className={styles.list}>
                {others.map((item) => (
                  <li key={item.slug} className={styles.item} data-tone="mint">
                    <Link to={guidePath(item.slug)} className={styles.item__link}>
                      <h3 className={styles.item__title}>{item.title}</h3>
                      <p className={styles.item__text}>{item.description}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
