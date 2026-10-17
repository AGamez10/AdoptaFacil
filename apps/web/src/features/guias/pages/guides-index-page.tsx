import { Link } from 'react-router-dom';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { DogMascot } from '../../landing/components/illustrations';
import { STATIC_PAGES } from '../../../seo/page-meta.js';
import { GUIDES, guidePath } from '../../../seo/guides';
import { breadcrumbLd, itemListLd, useSeo } from '../../../seo/seo';
import styles from './guides.module.scss';

const TONES = ['mint', 'sun', 'sky', 'coral'] as const;

/** Índice público de guías de adopción (/guias). */
export function GuidesIndexPage() {
  useSeo({
    ...STATIC_PAGES['/guias'],
    path: '/guias',
    jsonLd: [
      breadcrumbLd([
        { name: 'Inicio', path: '/' },
        { name: 'Guías', path: '/guias' },
      ]),
      itemListLd(GUIDES.map((guide) => ({ name: guide.title, path: guidePath(guide.slug) }))),
    ],
  });

  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-[var(--af-ink)]">
      <PublicNavbar />
      <main className="flex-1">
        <header className={styles.hero}>
          <div className={styles.container}>
            <div className={styles.hero__copy}>
              <p className={styles.eyebrow}>Guías AdoptaFácil</p>
              <h1 className={styles.hero__title}>Todo lo que necesitas para adoptar bien.</h1>
              <p className={styles.hero__lead}>
                Respuestas claras sobre cómo adoptar un perro en Colombia y cómo cuidarlo después,
                escritas para quien adopta por primera vez.
              </p>
            </div>
            <DogMascot className={styles.hero__art} />
          </div>
        </header>
        <div className={styles.container}>
          <ul className={styles.list}>
            {GUIDES.map((guide, index) => (
              <li key={guide.slug} className={styles.item} data-tone={TONES[index % TONES.length]}>
                <Link to={guidePath(guide.slug)} className={styles.item__link}>
                  <h2 className={styles.item__title}>{guide.title}</h2>
                  <p className={styles.item__text}>{guide.description}</p>
                  <span className={styles.item__more}>Leer la guía →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
