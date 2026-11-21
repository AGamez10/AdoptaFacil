import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Los enlaces `/#ayudar` o `/para-organizaciones#planes` llevan a su
 *  sección (react-router no desplaza a anclas por sí solo). Si la sección se
 *  monta un poco después (datos de la API), lo intenta una vez más. */
export function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const go = () => {
      const target = document.getElementById(id);
      target?.scrollIntoView({ block: 'start' });
      return Boolean(target);
    };
    if (go()) return;
    const timer = window.setTimeout(go, 400);
    return () => window.clearTimeout(timer);
  }, [hash]);
}
