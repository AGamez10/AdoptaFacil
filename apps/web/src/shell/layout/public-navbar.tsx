import { useEffect, useId, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import { useFeature } from '../capabilities';
import { Brand } from './brand';
import styles from './public-navbar.module.scss';

interface PublicNavLink {
  label: string;
  to: string;
  /** Ancla dentro de la landing (`/#…`): se pinta como enlace normal, nunca "activo". */
  anchor?: boolean;
}

/**
 * Public top nav (visitantes sin sesión), marca v3. La navegación sigue la
 * lógica de negocio del MVP — primero adoptar (animales y campañas), luego la
 * oferta para organizaciones — y solo enlaza a rutas que existen y a módulos
 * encendidos (Ola 1, R1-1). En móvil los enlaces viven en un panel desplegable
 * accesible, con las dos acciones principales siempre visibles.
 */
export function PublicNavbar() {
  const resources = useFeature('resources');
  const marketplace = useFeature('marketplace');
  const payments = useFeature('payments');
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const location = useLocation();

  // Navegar (o cambiar de ancla) cierra el menú móvil.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const links: PublicNavLink[] = [
    { label: 'Animales en adopción', to: '/adoptar' },
    { label: 'Campañas', to: '/campanas' },
    { label: 'Guías', to: '/guias' },
    ...(payments ? [{ label: 'Donar', to: '/donaciones' }] : []),
    ...(resources ? [{ label: 'Banco de recursos', to: '/recursos' }] : []),
    ...(marketplace ? [{ label: 'Marketplace', to: '/marketplace' }] : []),
    { label: 'Para organizaciones', to: '/#organizaciones', anchor: true },
  ];

  const renderLink = (link: PublicNavLink, className: string, activeClass: string) =>
    link.anchor ? (
      <Link key={link.to} to={link.to} className={className}>
        {link.label}
      </Link>
    ) : (
      <NavLink
        key={link.to}
        to={link.to}
        className={({ isActive }) => cn(className, isActive && activeClass)}
      >
        {link.label}
      </NavLink>
    );

  return (
    <header className={styles.navbar} data-open={open}>
      <div className={styles.navbar__row}>
        <Link to="/" aria-label="Ir al inicio" className={styles.navbar__brand}>
          <Brand />
        </Link>

        <nav aria-label="Navegación pública" className={styles.navbar__links}>
          {links.map((link) =>
            renderLink(link, styles.navbar__link, styles['navbar__link--active']),
          )}
        </nav>

        <div className={styles.navbar__actions}>
          <Link to="/login" className={styles.navbar__login}>
            Ingresar
          </Link>
          <Link to="/register" className={styles.navbar__register}>
            Registrar mi organización
          </Link>
          <button
            type="button"
            className={styles.navbar__toggle}
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="sr-only">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
            <span aria-hidden="true" className={styles.navbar__burger} data-open={open} />
          </button>
        </div>
      </div>

      <nav
        id={menuId}
        aria-label="Menú móvil"
        className={styles.navbar__mobile}
        data-open={open}
        hidden={!open}
      >
        {links.map((link) =>
          renderLink(link, styles.navbar__mobileLink, styles['navbar__mobileLink--active']),
        )}
        <div className={styles.navbar__mobileActions}>
          <Link to="/adoptar" className={styles.navbar__mobilePrimary}>
            Quiero adoptar
          </Link>
          <Link to="/register" className={styles.navbar__mobileSecondary}>
            Registrar mi organización
          </Link>
          <Link to="/login" className={styles.navbar__mobileSecondary}>
            Ingresar
          </Link>
        </div>
      </nav>
    </header>
  );
}
