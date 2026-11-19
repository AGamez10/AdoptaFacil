import { Suspense, useEffect, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PlatformMfaGate } from '../../features/platform-team';
import { useNav } from '../navigation/nav-context';
import { LayoutErrorBoundary } from './error-boundary';
import { Header } from './header';
import { ShellContentErrorFallback } from '../errors/error-fallbacks';
import { FullPageLoading } from './layout-states';
import { MobileNavDrawer, Sidebar } from './sidebar';

/**
 * Root layout for the authenticated portal: persistent sidebar (escritorio),
 * off-canvas drawer (móvil/tablet), a header carrying the transparency indicator,
 * and the routed content region. Content is wrapped in an error boundary and a
 * Suspense boundary so a failing or lazily-loaded page degrades gracefully at the
 * layout level without blanking the shell. `children` replaces the routed
 * outlet (the app-wide 404 reuses the shell this way for signed-in users).
 */
export function AppLayout({ children }: { children?: ReactNode } = {}) {
  const location = useLocation();
  const { closeDrawer } = useNav();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    closeDrawer();
  }, [location.pathname, closeDrawer]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <MobileNavDrawer />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1">
          <LayoutErrorBoundary
            resetKeys={[location.pathname]}
            fallback={(error, reset) => <ShellContentErrorFallback error={error} reset={reset} />}
          >
            <Suspense fallback={<FullPageLoading />}>
              {/* F19: platform staff pass their second factor before any tool. */}
              <PlatformMfaGate>{children ?? <Outlet />}</PlatformMfaGate>
            </Suspense>
          </LayoutErrorBoundary>
        </main>
      </div>
    </div>
  );
}
