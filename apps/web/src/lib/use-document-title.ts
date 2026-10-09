import { useEffect } from 'react';

const SUFFIX = 'AdoptaFácil';

/**
 * Título del documento por página (auditoría UX §3: el `<title>` era siempre
 * "AdoptaFácil"). Restaura el título anterior al desmontar.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title === SUFFIX ? SUFFIX : `${title} · ${SUFFIX}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
