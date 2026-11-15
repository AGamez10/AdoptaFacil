import { Link } from 'react-router-dom';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { STATIC_PAGES } from '../../../seo/page-meta.js';
import { breadcrumbLd, useSeo } from '../../../seo/seo';
import { NationalBoard } from '../components/national-board';
import { ScopeExplainer } from '../components/scope-explainer';
import styles from './national-transparency-public-page.module.scss';

/**
 * `/transparencia-nacional` (público, sin cuenta): el tablero completo del
 * rescate animal en Colombia, con la diferencia frente al libro de cada
 * organización.
 */
export function NationalTransparencyPublicPage() {
  useSeo({
    ...STATIC_PAGES['/transparencia-nacional'],
    path: '/transparencia-nacional',
    jsonLd: [
      breadcrumbLd([
        { name: 'Inicio', path: '/' },
        { name: 'Transparencia Nacional', path: '/transparencia-nacional' },
      ]),
    ],
  });

  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-[var(--af-ink)]">
      <PublicNavbar />
      <main className="flex-1">
        <header className={styles.hero}>
          <div className={styles.container}>
            <p className={styles.eyebrow}>Transparencia Nacional</p>
            <h1 className={styles.title}>El rescate animal de Colombia, en cifras abiertas.</h1>
            <p className={styles.lead}>
              La suma de los libros públicos de todas las organizaciones aprobadas en AdoptaFácil:
              cuánto se recibe, en qué se usa y cuántos animales encuentran familia. Sin cuenta y
              sin datos de quienes donan.
            </p>
          </div>
        </header>
        <div className={styles.container}>
          <NationalBoard variant="full" />
          <h2 className={styles.h2}>Dos escalas, una misma regla</h2>
          <ScopeExplainer />
          <p className={styles.more}>
            ¿Quieres ver el detalle de una organización?{' '}
            <Link to="/#transparencia">Abre el libro público de cada una</Link>.
          </p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
