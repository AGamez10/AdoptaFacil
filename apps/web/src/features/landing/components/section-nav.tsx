import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { cn } from '@adoptafacil/ui';
import styles from './section-nav.module.scss';

export interface SectionNavItem {
  /** `id` de la sección en la página. */
  id: string;
  label: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Índice de la página: una fila fija bajo el menú con las secciones que hay
 * en ella, que marca dónde estás al bajar (scroll-spy con
 * IntersectionObserver, sin escuchar el scroll). Solo muestra las secciones
 * que de verdad se montaron (una sección sin datos no aparece) y en celular
 * es una fila deslizable que mantiene a la vista la sección activa.
 */
export function SectionNav({ items, label }: { items: SectionNavItem[]; label: string }) {
  const navRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLUListElement>(null);
  const [present, setPresent] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const ids = items.map((item) => item.id).join('|');

  // Qué secciones existen: algunas se montan tarde (datos de la API) o nunca.
  useEffect(() => {
    const scope = navRef.current?.parentElement;
    if (!scope) return;
    const check = () => {
      const found = ids.split('|').filter((id) => document.getElementById(id));
      setPresent((prev) => (prev.join('|') === found.join('|') ? prev : found));
    };
    check();
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(check);
    observer.observe(scope, { childList: true });
    return () => observer.disconnect();
  }, [ids]);

  // Sección activa: la que cruza la franja central de la pantalla.
  useEffect(() => {
    if (present.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = present.find((id) => visible.has(id));
        setActive(first ?? null);
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    for (const id of present) {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [present]);

  // En celular, la pestaña activa se queda a la vista dentro de la fila.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !active) return;
    const link = rail.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!link || typeof rail.scrollTo !== 'function') return;
    const left = link.offsetLeft - (rail.clientWidth - link.offsetWidth) / 2;
    rail.scrollTo({
      left: Math.max(0, left),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [active]);

  const onClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    window.history.replaceState(window.history.state, '', `#${id}`);
    setActive(id);
  };

  const shown = items.filter((item) => present.includes(item.id));

  return (
    <nav
      ref={navRef}
      className={styles.nav}
      aria-label={label}
      data-testid="section-nav"
      hidden={shown.length < 2}
    >
      <ul ref={railRef} className={styles.rail}>
        {shown.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              data-section={item.id}
              className={cn(styles.link, active === item.id && styles['link--active'])}
              aria-current={active === item.id ? 'location' : undefined}
              onClick={(event) => onClick(event, item.id)}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
