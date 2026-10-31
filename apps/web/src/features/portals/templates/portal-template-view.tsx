import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AnimalSummary, Review } from '@adoptafacil/contracts';
import { RegisterReviewDialog } from '../components/register-review-dialog';
import { PublicLedgerDialog } from '../../ledger/components/public-ledger-dialog';
import { useFeature } from '../../../shell/capabilities';
import {
  buildAdoptionRequestHref,
  buildSponsorHref,
  publicAnimalDetailHref,
} from '../model/animals-catalog';
import { hslStringToHex } from '../model/color-conversion';
import { PreviewAnimalDialog } from './demo/preview-animal-dialog';
import { PreviewLedgerDialog } from './demo/preview-ledger-dialog';
import { createKit } from './engine/kit';
import { buildTemplateModel, type TemplateSourceData } from './engine/model';
import { createCatalog, createMotion } from './engine/runtime';
import type { TemplateDesign, ThreeModule } from './engine/types';
import { useTemplateAssets } from './use-template-assets';

export interface PortalTemplateViewProps {
  design: TemplateDesign;
  source: TemplateSourceData;
  /** Tokens de marca ya saneados como custom properties (`brandTokensToStyle`). */
  themeStyle: CSSProperties;
  /** Una reseña recién creada (para mostrarla sin recargar, como el clásico). */
  onReviewCreated?: (review: Review) => void;
  /**
   * Vista previa (`/plantillas/:id`, con datos de ejemplo o de una organización
   * aún sin publicar): los enlaces que saldrían de la página no navegan. La ficha
   * de cada animal y el libro público se abren en un diálogo con los datos de la
   * vista previa, así nunca se consulta a la API con el slug de ejemplo.
   */
  demo?: boolean;
}

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
  demo = false,
}: PortalTemplateViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [previewAnimal, setPreviewAnimal] = useState<AnimalSummary | null>(null);
  const [three, setThree] = useState<ThreeModule | null | undefined>(
    design.webgl ? undefined : null,
  );

  const model = useMemo(() => buildTemplateModel(source), [source]);
  // Vista previa: cualquier enlace a un animal (ficha, adoptar, apadrinar) abre
  // su ficha en el diálogo, en TODAS las plantillas (enlace o `env.go`).
  const animalByHref = useMemo(() => {
    const map = new Map<string, AnimalSummary>();
    for (const a of source.animals) {
      map.set(publicAnimalDetailHref(source.slug, a), a);
      map.set(buildAdoptionRequestHref(a.organizationId, a), a);
      map.set(buildSponsorHref(a), a);
    }
    return map;
  }, [source]);
  const openPreview = useRef<(href: string) => boolean>(() => false);
  openPreview.current = (href) => {
    const animal = animalByHref.get(href);
    if (animal) setPreviewAnimal(animal);
    return Boolean(animal);
  };
  // Con el módulo de reseñas apagado, la API responde 404 a "Registrar reseña":
  // la plantilla no muestra ni la sección ni el botón (igual que el clásico).
  const reputation = useFeature('reputation');

  // Hoja de estilos de la plantilla (acotada a .af-tpl / .tpl-<id>) + fuentes.
  useTemplateAssets(design);

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
          if (demo) openPreview.current(href);
          else if (href.startsWith('/') && !href.startsWith('//')) navigate(href);
        },
      });
      kit.init(root, motion);
      if (!reputation) {
        const gone = new Set<string>();
        root.querySelectorAll('[data-sec="resenas"], [data-review]').forEach((el) => {
          if (el.id) gone.add(el.id);
          el.remove();
        });
        // Sin enlaces muertos en la navegación de la plantilla.
        root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
          if (gone.has(a.getAttribute('href')?.slice(1) ?? '')) a.remove();
        });
      }
    } catch (error) {
      // Una animación que falle nunca debe dejar el portal en blanco: el
      // contenido (HTML ya montado) sigue visible y navegable.
      console.error('[portal-template]', design.id, error);
    }
    return () => {
      ctl.abort();
      root.innerHTML = '';
    };
  }, [design, model, three, navigate, reputation, demo]);

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
        if (!demo) setReviewOpen(true);
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
      // En la vista previa nada sale de la página; un animal abre su ficha aquí.
      if (demo) {
        event.preventDefault();
        openPreview.current(href);
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
  }, [navigate, demo]);

  return (
    <>
      <div
        ref={rootRef}
        className={`af-tpl tpl-${design.id}${design.kit ? ' kit' : ''}`}
        style={themeStyle}
        data-testid="portal-template"
        data-template={design.id}
      />
      {reputation && !demo && onReviewCreated && (
        <RegisterReviewDialog
          slug={source.slug}
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          onSubmitted={onReviewCreated}
        />
      )}
      {demo ? (
        <>
          <PreviewLedgerDialog
            ledger={source.ledger}
            open={ledgerOpen}
            onOpenChange={setLedgerOpen}
          />
          <PreviewAnimalDialog
            animal={previewAnimal}
            animals={source.animals}
            org={source.organization}
            slug={source.slug}
            onOpenAnimal={setPreviewAnimal}
          />
        </>
      ) : (
        <PublicLedgerDialog slug={source.slug} open={ledgerOpen} onOpenChange={setLedgerOpen} />
      )}
    </>
  );
}
