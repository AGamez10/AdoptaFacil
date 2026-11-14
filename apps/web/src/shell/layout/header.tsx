import { Button } from '@adoptafacil/ui';
import { MenuIcon, LogOutIcon } from '../icons';
import { useNav } from '../navigation/nav-context';
import { useSession } from '../auth';
import { TransparencyIndicator } from '../transparency';
import { Brand } from './brand';
import { PendingBell } from './pending-bell';
import styles from './header.module.scss';

/**
 * Shell header, present on every module. Left: the drawer toggle (< lg) / brand
 * on móvil. Center–right: the persistent transparency indicator (§M14) and
 * session actions. BEM+SCSS (REFACTOR-VISUAL v2, Fase 3).
 */
export function Header() {
  const { toggleDrawer } = useNav();
  const { user, signOut } = useSession();

  const initials = user?.name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <header className={styles.topbar}>
      {/* Drawer toggle — móvil/tablet only */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleDrawer}
        aria-label="Abrir menú de navegación"
        className="px-2 lg:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </Button>

      {/* Brand on móvil/tablet (the sidebar carries it on escritorio) */}
      {/* En celulares angostos solo el ícono: con el nombre completo el
          encabezado no cabía y toda la página se desplazaba de lado. Por
          debajo de 380 px ni el ícono cabe junto al indicador, la campana y
          la cuenta; la marca sigue en el menú lateral. */}
      <span className="hidden min-[560px]:inline-flex lg:hidden">
        <Brand to="/inicio" />
      </span>
      <span className="hidden min-[380px]:inline-flex min-[560px]:hidden">
        <Brand to="/inicio" withWordmark={false} />
      </span>

      {/* Persistent transparency indicator (§M14) */}
      <div className={styles.topbar__actions}>
        <TransparencyIndicator />
        <PendingBell />

        {user && (
          <div className={styles.topbar__user}>
            <span className={styles.topbar__avatar} aria-hidden>
              {initials}
            </span>
            <span className={styles['topbar__user-name']} title={user.email}>
              {user.name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              aria-label="Cerrar sesión"
              className="px-2"
            >
              <LogOutIcon className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
