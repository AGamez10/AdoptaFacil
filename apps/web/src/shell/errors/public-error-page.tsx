import { useSeo } from '../../seo/seo';
import { PublicFooter } from '../layout/public-footer';
import { PublicNavbar } from '../layout/public-navbar';
import { ErrorScreen, type ErrorScreenProps, type ErrorSuggestion } from './error-screen';
import styles from './error-screen.module.scss';

/** Atajos de la 404 pública: solo módulos del MVP que nunca se apagan. */
export const PUBLIC_SUGGESTIONS: ErrorSuggestion[] = [
  { label: 'Adoptar', description: 'Perros y gatos que buscan hogar', to: '/adoptar' },
  { label: 'Campañas', description: 'Causas activas de las organizaciones', to: '/campanas' },
  { label: 'Guías', description: 'Todo sobre adopción responsable', to: '/guias' },
];

/**
 * Pantalla de error con el marco público (navbar + pie, fondo crema). Para
 * visitantes sin sesión y para las páginas públicas (portales, campañas,
 * fichas). Marca la página como `noindex` para que los buscadores no indexen
 * errores como si fueran contenido.
 */
export function PublicErrorPage(props: ErrorScreenProps) {
  const title = props.title ?? (props.kind === 'not-found' ? 'Página no encontrada' : 'Error');
  useSeo({ title, noindex: true });
  return (
    <div className={styles.page}>
      <PublicNavbar />
      <main className={styles.page__main}>
        <ErrorScreen {...props} />
      </main>
      <PublicFooter />
    </div>
  );
}

/** 404 pública lista para usar: volver al inicio o ir a adoptar. */
export function PublicNotFoundPage({
  title,
  message,
}: Pick<ErrorScreenProps, 'title' | 'message'>) {
  return (
    <PublicErrorPage
      kind="not-found"
      title={title}
      message={message}
      actions={[
        { label: 'Volver al inicio', to: '/' },
        { label: 'Ver animales en adopción', to: '/adoptar', variant: 'secondary' },
      ]}
      suggestions={PUBLIC_SUGGESTIONS}
    />
  );
}
