import { useEffect } from 'react';
import { BASE_CSS } from './engine/base-css';
import type { TemplateDesign } from './engine/types';

const STYLE_ID = 'af-tpl-style';
const FONT_ID = 'af-tpl-fonts';

/**
 * Monta la hoja de estilos de una plantilla (acotada a `.af-tpl` / `.tpl-<id>`)
 * y sus fuentes mientras el diseño esté activo. Se quita al desmontar o al
 * cambiar de plantilla, para que nunca se filtre a otras pantallas.
 */
export function useTemplateAssets(design: TemplateDesign | null | undefined): void {
  useEffect(() => {
    if (!design) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = BASE_CSS + design.css;
    document.head.appendChild(style);
    let link: HTMLLinkElement | null = null;
    if (design.fonts) {
      link = document.createElement('link');
      link.id = FONT_ID;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${design.fonts}&display=swap`;
      link.referrerPolicy = 'no-referrer';
      document.head.appendChild(link);
    }
    return () => {
      style.remove();
      link?.remove();
    };
  }, [design]);
}
