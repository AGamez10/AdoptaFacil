import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Review } from '@adoptafacil/contracts';
import { ComingSoon, Dialog, DialogContent, DialogHeader, DialogTitle } from '@adoptafacil/ui';
import { RegisterReviewDialog } from '../components/register-review-dialog';
import { hslStringToHex } from '../model/color-conversion';
import { BASE_CSS } from './engine/base-css';
import { createKit } from './engine/kit';
import { COPY, buildTemplateModel, type TemplateSourceData } from './engine/model';
import { createCatalog, createMotion } from './engine/runtime';
import type { TemplateDesign, ThreeModule } from './engine/types';

export interface PortalTemplateViewProps {
  design: TemplateDesign;
  source: TemplateSourceData;
  /** Tokens de marca ya saneados como custom properties (`brandTokensToStyle`). */
  themeStyle: CSSProperties;
  /** Una reseña recién creada (para mostrarla sin recargar, como el clásico). */
  onReviewCreated: (review: Review) => void;
}

const STYLE_ID = 'af-tpl-style';
const FONT_ID = 'af-tpl-fonts';

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Monta una plantilla sobre los datos REALES de la organización. La plantilla
 * produce su HTML a partir del view-model saneado (`buildTemplateModel`): todo
 * texto viene escapado y todo enlace validado, por eso es seguro asignarlo como
 * marcado. Los enlaces internos se resuelven con el router (sin recargar), y
 * "Registrar reseña" / "Ver libro completo" abren los MISMOS diálogos del portal
 * clásico.
 */
export function PortalTemplateView({
  design,
  source,
  themeStyle,
  onReviewCreated,
}: PortalTemplateViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [three, setThree] = useState<ThreeModule | null | undefined>(
    design.webgl ? undefined : null,
  );

  const model = useMemo(() => buildTemplateModel(source), [source]);

  // Hoja de estilos de la plantilla (acotada a .af-tpl / .tpl-<id>) + fuentes.
  useEffect(() => {
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

  // Three.js solo se descarga para plantillas WebGL y si el navegador lo soporta.
  useEffect(() => {
    if (!design.webgl) {
      setThree(null);
      return;
    }
    if (!hasWebGL()) {
      setThree(null);
      return;
    }
    let active = true;
    import('three')
      .then((mod) => {
        if (active) setThree(mod);
      })
      .catch(() => {
        if (active) setThree(null);
      });
    return () => {
      active = false;
    };
  }, [design]);

  // Montaje del HTML + init de la plantilla. Se rehace al cambiar datos/plantilla.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || three === undefined) return;
    const ctl = new AbortController();
    const kit = createKit(model);
    root.innerHTML = design.html(model, kit);
    const motion = createMotion(ctl.signal);
    try {
      design.init?.(root, {
        m: model,
        kit,
        motion,
        catalog: createCatalog(model.ANIMALS),
        THREE: three,
        brand: () =>
          hslStringToHex(getComputedStyle(root).getPropertyValue('--primary').trim(), '#1F7A6D'),
        go: (href) => {
          if (href.startsWith('/') && !href.startsWith('//')) navigate(href);
        },
      });
      kit.init(root, motion);
    } catch (error) {
      // Una animación que falle nunca debe dejar el portal en blanco: el
      // contenido (HTML ya montado) sigue visible y navegable.
      console.error('[portal-template]', design.id, error);
    }
    return () => {
      ctl.abort();
      root.innerHTML = '';
    };
  }, [design, model, three, navigate]);

  // Delegación de clics: enlaces internos por el router, anclas dentro de la
  // plantilla, y los diálogos de reseña y libro público.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest('[data-review]')) {
        event.preventDefault();
        setReviewOpen(true);
        return;
      }
      if (target.closest('[data-ledger]')) {
        event.preventDefault();
        setLedgerOpen(true);
        return;
      }
      const a = target.closest('a');
      if (!a || !root.contains(a)) return;
      const href = a.getAttribute('href') ?? '';
      if (href.startsWith('#')) {
        const id = href.slice(1);
        // Las anclas de las plantillas son ids simples; cualquier otra cosa se ignora.
        if (!/^[A-Za-z][\w-]*$/.test(id)) return;
        const dest = root.querySelector(`#${id}`) ?? root.querySelector(`[data-sec~="${id}"]`);
        if (dest) {
          event.preventDefault();
          dest.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      if (a.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      if (href.startsWith('/') && !href.startsWith('//')) {
        event.preventDefault();
        navigate(href);
      }
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [navigate]);

  return (
    <>
      <div
        ref={rootRef}
        className={`af-tpl tpl-${design.id}${design.kit ? ' kit' : ''}`}
        style={themeStyle}
        data-testid="portal-template"
        data-template={design.id}
      />
      <RegisterReviewDialog
        slug={source.slug}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onSubmitted={onReviewCreated}
      />
      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{COPY.ledgerTitle}</DialogTitle>
          </DialogHeader>
          <ComingSoon
            title="Libro público"
            description="El registro público de movimientos de esta organización estará disponible próximamente."
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
