import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import { ChevronDownIcon } from '../icons';
import { Brand } from './brand';
import { usePublicModules, type PublicModuleState } from './public-nav-model';
import styles from './public-navbar.module.scss';

/**
 * Public top nav (visitantes sin sesión), marca v3. Cuatro entradas fijas en
 * el orden de los caminos del hero —Adoptar, Ayudar, Comunidad,
 * Organizaciones— y cada módulo encendido dentro de su grupo, así el menú no
 * crece ni se rompe cuando se encienden más módulos. Solo enlaza a rutas que
 * existen y a módulos encendidos (Ola 1, R1-1). Los grupos son menús de
 * divulgación (botón + panel) que se abren con clic o teclado y se cierran con
 * Escape, al salir del grupo o al navegar. En móvil todo vive en un panel
 * desplegable con los grupos como secciones.
 */
export function PublicNavbar() {
  const groups = usePublicModules()
    .map((group) => ({ ...group, modules: group.modules.filter((module) => module.enabled) }))
    .filter((group) => group.modules.length > 0);
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const menuId = useId();
  const groupsRef = useRef<HTMLElement>(null);
  const location = useLocation();

  // Navegar (o cambiar de ancla) cierra los menús.
  useEffect(() => {
    setOpen(false);
    setOpenGroup(null);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open && !openGroup) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (openGroup) {
        groupsRef.current
          ?.querySelector<HTMLButtonElement>(`[data-group-button="${openGroup}"]`)
          ?.focus();
      }
      setOpen(false);
      setOpenGroup(null);
    };
    const onPointer = (event: PointerEvent) => {
      if (openGroup && !groupsRef.current?.contains(event.target as Node)) setOpenGroup(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open, openGroup]);

  const moduleLink = (module: PublicModuleState, className: string, activeClass: string) =>
    module.anchor ? (
      <Link key={module.key} to={module.to} className={className}>
        {module.label}
      </Link>
    ) : (
      <NavLink
        key={module.key}
        to={module.to}
        className={({ isActive }) => cn(className, isActive && activeClass)}
      >
        {module.label}
      </NavLink>
    );

  return (
    <header className={styles.navbar} data-open={open}>
      <div className={styles.navbar__row}>
        <Link to="/" aria-label="Ir al inicio" className={styles.navbar__brand}>
          <Brand />
        </Link>

        <nav ref={groupsRef} aria-label="Navegación pública" className={styles.navbar__links}>
          {groups.map((group) => {
            if (group.modules.length === 1) {
              // Un grupo con un solo módulo encendido es un enlace directo con
              // el nombre del módulo (p. ej. solo "Campañas" o solo "Guías").
              return moduleLink(
                group.modules[0],
                styles.navbar__link,
                styles['navbar__link--active'],
              );
            }
            const panelId = `${menuId}-${group.key}`;
            const expanded = openGroup === group.key;
            return (
              <div
                key={group.key}
                className={styles.navbar__group}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setOpenGroup((current) => (current === group.key ? null : current));
                  }
                }}
              >
                <button
                  type="button"
                  className={styles.navbar__link}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  data-group-button={group.key}
                  onClick={() => setOpenGroup(expanded ? null : group.key)}
                >
                  {group.label}
                  <ChevronDownIcon className={styles.navbar__chevron} />
                </button>
                <div id={panelId} className={styles.navbar__panel} data-open={expanded}>
                  <ul className={styles.navbar__panelList}>
                    {group.modules.map((module) => (
                      <li key={module.key}>
                        <Link to={module.to} className={styles.navbar__panelLink}>
                          <span className={styles.navbar__panelIcon} aria-hidden="true">
                            <module.Icon />
                          </span>
                          <span>
                            <span className={styles.navbar__panelTitle}>{module.label}</span>
                            <span className={styles.navbar__panelText}>{module.description}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
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
        {groups.map((group) => (
          <div key={group.key} className={styles.navbar__mobileGroup}>
            {group.modules.length > 1 && (
              <p className={styles.navbar__mobileHeading}>{group.label}</p>
            )}
            {group.modules.map((module) =>
              moduleLink(module, styles.navbar__mobileLink, styles['navbar__mobileLink--active']),
            )}
          </div>
        ))}
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
