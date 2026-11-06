import { useEffect, useState } from 'react';
import type { PortalTemplateId, PortalTheme } from '@adoptafacil/contracts';
import { safePortalTheme, safeTemplate } from '../model/theme';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface PublicTheme {
  template: PortalTemplateId;
  tokens: PortalTheme;
}

const DEFAULT_THEME: PublicTheme = { template: 'clasica', tokens: {} as PortalTheme };

/**
 * Plantilla y colores públicos de una organización (mismo endpoint que usa el
 * portal). Es best-effort: si falla, se queda con el diseño clásico.
 */
export function usePublicTheme(slug: string | undefined): PublicTheme {
  const [theme, setTheme] = useState<PublicTheme>(DEFAULT_THEME);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    fetch(`${API_BASE}/public/organizations/${encodeURIComponent(slug)}/theme`)
      .then((response) => (response.ok ? (response.json() as Promise<unknown>) : null))
      .then((body) => {
        if (!active) return;
        const raw = (body ?? {}) as { tokens?: unknown; template?: unknown };
        setTheme({ template: safeTemplate(raw.template), tokens: safePortalTheme(raw.tokens) });
      })
      .catch(() => {
        if (active) setTheme(DEFAULT_THEME);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  return theme;
}
