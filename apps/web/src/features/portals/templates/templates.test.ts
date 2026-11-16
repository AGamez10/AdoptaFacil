import { describe, expect, it } from 'vitest';
import { PORTAL_TEMPLATE_IDS, PORTAL_TEMPLATES } from '@adoptafacil/contracts';
import { PROFILES, FIXTURE_NOW } from './__fixtures__/profiles';
import { createKit } from './engine/kit';
import { EMPTY, buildTemplateModel } from './engine/model';
import { ENGINE_TEMPLATE_IDS, isEngineTemplate, loadDesign } from './registry';

/**
 * Contrato de las plantillas del portal (M14): cada diseño pinta las 12
 * secciones del portal clásico con las MISMAS reglas de visibilidad, solo con
 * datos reales y saneados, y ningún texto/enlace de la organización puede
 * inyectar marcado o scripts.
 */
const SECTIONS = [
  'transparencia',
  'acciones',
  'animales',
  'productos',
  'necesidades',
  'campana',
  'redes',
  'ayuda',
  'nosotros',
  'resenas',
  'contacto',
  'libro',
] as const;

const DESIGN_IDS = ENGINE_TEMPLATE_IDS;

async function render(id: (typeof DESIGN_IDS)[number], profile: keyof typeof PROFILES) {
  const design = await loadDesign(id);
  const model = buildTemplateModel(PROFILES[profile], FIXTURE_NOW);
  const root = document.createElement('div');
  root.innerHTML = design.html(model, createKit(model));
  return { root, model };
}

const sectionsOf = (root: HTMLElement) =>
  new Set(
    [...root.querySelectorAll<HTMLElement>('[data-sec]')].flatMap((el) =>
      (el.dataset.sec ?? '').split(' '),
    ),
  );

describe('registro de plantillas', () => {
  it('cada diseño del motor tiene su id en PORTAL_TEMPLATE_IDS (contrato de la API)', () => {
    for (const id of ENGINE_TEMPLATE_IDS) {
      expect(PORTAL_TEMPLATE_IDS).toContain(id);
    }
  });

  it('son 20 diseños del motor (12 gratuitos y 8 Premium) además de la clásica', () => {
    expect(DESIGN_IDS).toHaveLength(20);
    const premium = PORTAL_TEMPLATES.filter((t) => t.tier === 'paid').map((t) => t.id);
    // Decisión del cliente (2026-11-15): Sistema solar e Hilo pasan a Pro y llega Documental.
    for (const id of [
      'album',
      'linterna',
      'revelado',
      'velitas',
      'terminal',
      'solar',
      'hilo',
      'documental',
    ]) {
      expect(DESIGN_IDS).toContain(id);
      expect(premium).toContain(id);
    }
    expect(ENGINE_TEMPLATE_IDS).not.toContain('clasica');
  });

  it('isEngineTemplate solo acepta ids del motor (nunca la clásica ni desconocidos)', () => {
    expect(isEngineTemplate('cine')).toBe(true);
    expect(isEngineTemplate('clasica')).toBe(false);
    expect(isEngineTemplate('historias')).toBe(false);
    expect(isEngineTemplate('<script>')).toBe(false);
  });
});

describe.each(DESIGN_IDS)('plantilla %s', (id) => {
  it('completa: pinta las 12 secciones', async () => {
    const { root } = await render(id, 'completa');
    expect([...sectionsOf(root)].sort()).toEqual([...SECTIONS].sort());
    expect(root.querySelector('#portal-help-cta')).not.toBeNull();
  });

  it.each(['nueva', 'vacia'] as const)(
    '%s: oculta exactamente lo que el clásico oculta',
    async (profile) => {
      const { root, model } = await render(id, profile);
      const hidden = (['transparencia', 'nosotros', 'contacto', 'redes'] as const).filter(
        (s) => !model.SHOW[s],
      );
      const expected = SECTIONS.filter((s) => !hidden.includes(s as (typeof hidden)[number]));
      expect([...sectionsOf(root)].sort()).toEqual([...expected].sort());
    },
  );

  it('vacia: no inventa sellos, cifras ni reseñas', async () => {
    const { root, model } = await render(id, 'vacia');
    expect(model.BADGES).toHaveLength(0);
    const text = root.textContent ?? '';
    for (const claim of [
      'RTE vigente',
      'ESAL',
      'Verificada',
      'certificad',
      'Ley 1581',
      'llega directo',
    ]) {
      expect(text).not.toContain(claim);
    }
    expect(root.querySelectorAll('[data-sec~="resenas"] figure')).toHaveLength(0);
  });

  it('hostil: ningún dato de la organización inyecta marcado ni enlaces peligrosos', async () => {
    const { root } = await render(id, 'hostil');
    expect(root.querySelectorAll('script, object, embed, base, meta, form')).toHaveLength(0);
    for (const el of root.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        expect(attr.name.startsWith('on'), `${el.tagName} ${attr.name}`).toBe(false);
        if (['href', 'src', 'xlink:href', 'action', 'formaction'].includes(attr.name)) {
          expect(attr.value, `${el.tagName} ${attr.name}`).toMatch(
            /^(#|\/(?![/\\])|https:\/\/|http:\/\/|tel:\+?\d|mailto:)/,
          );
        }
      }
    }
    // Las imágenes solo se piden por https (nunca contenido mixto)
    root.querySelectorAll('img[src], iframe[src]').forEach((el) => {
      expect(el.getAttribute('src')).toMatch(/^https:\/\//);
    });
    // Enlaces que abren otra pestaña nunca exponen window.opener
    root.querySelectorAll('a[target="_blank"]').forEach((a) => {
      expect(a.getAttribute('rel') ?? '').toMatch(/noopener/);
    });
  });
});

/**
 * Mismos datos en TODAS las plantillas: cambiar de diseño nunca esconde lo que
 * la organización publicó (el libro público, necesidades, productos, reseñas y
 * campaña). Lo que muestra el portal sale del mismo modelo, sin importar el diseño.
 */
/** Texto visible sin espacios: un diseño puede partir un título en dos líneas. */
const plain = (html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent ?? '').replace(/\s+/g, '');
};
const textOf = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, '');

describe.each(DESIGN_IDS)('plantilla %s: datos intactos al cambiar de diseño', (id) => {
  it('pinta el libro público con sus totales y sus últimos movimientos', async () => {
    const { root, model } = await render(id, 'completa');
    const text = textOf(root);
    expect(model.LEDGER.rows.length).toBeGreaterThan(0);
    for (const row of model.LEDGER.rows) expect(text).toContain(plain(row.concept));
    for (const total of [model.LEDGER.income, model.LEDGER.expense, model.LEDGER.balance]) {
      expect(text).toContain(plain(total));
    }
    expect(root.querySelector('[data-sec~="libro"] [data-ledger]')).not.toBeNull();
    const libro = root.querySelector<HTMLElement>('[data-sec~="libro"]');
    expect(libro && textOf(libro)).not.toContain(plain(EMPTY.libro));
  });

  it('pinta todas las necesidades, productos, reseñas y la campaña activa', async () => {
    const { root, model } = await render(id, 'completa');
    const text = textOf(root);
    for (const n of model.NEEDS) expect(text, `necesidad ${n.title}`).toContain(plain(n.title));
    for (const p of model.PRODUCTS) expect(text, `producto ${p.name}`).toContain(plain(p.name));
    for (const r of model.REVIEWS) expect(text, `reseña ${r.name}`).toContain(plain(r.text));
    expect(text).toContain(plain(model.CAMPAIGN.title));
  });
});

describe('libro público en las plantillas', () => {
  it('si el libro no cargó, ninguna plantilla afirma que no hay movimientos', async () => {
    for (const id of DESIGN_IDS) {
      const design = await loadDesign(id);
      const model = buildTemplateModel({ ...PROFILES.completa, ledger: null }, FIXTURE_NOW);
      const root = document.createElement('div');
      root.innerHTML = design.html(model, createKit(model));
      const text = root.textContent ?? '';
      expect(text, id).not.toMatch(/aún no ha registrado movimientos/i);
      expect(root.querySelector('[data-ledger]'), id).not.toBeNull();
    }
  });
});

describe('Documental: el video de la organización abre el portal', () => {
  const withVideo = (coverVideo: unknown) =>
    buildTemplateModel({ ...PROFILES.completa, coverVideo } as never, FIXTURE_NOW);

  it('con video: lo pinta a pantalla completa (silenciado y en bucle) con su portada', async () => {
    const design = await loadDesign('documental');
    const model = withVideo({
      url: 'https://cdn.example.org/storage/public?key=portada.mp4',
      poster: 'https://cdn.example.org/storage/public?key=portada.poster.webp',
    });
    const root = document.createElement('div');
    root.innerHTML = design.html(model, createKit(model));
    const video = root.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toContain('portada.mp4');
    expect(video?.getAttribute('poster')).toContain('portada.poster.webp');
    for (const attr of ['autoplay', 'muted', 'loop', 'playsinline']) {
      expect(video?.hasAttribute(attr)).toBe(true);
    }
    // Siempre se puede pausar (WCAG 2.2.2) y activar el sonido.
    expect(root.querySelector('[data-dc-play]')).not.toBeNull();
    expect(root.querySelector('[data-dc-sound]')).not.toBeNull();
    expect(root.querySelector('.dc-reel')).toBeNull();
  });

  it('con dos videos: el primero se ve y el segundo espera su turno sin descargarse', async () => {
    const design = await loadDesign('documental');
    const model = buildTemplateModel(
      {
        ...PROFILES.completa,
        coverVideo: { url: 'https://cdn.example.org/storage/public?key=uno.mp4' },
        coverVideo2: { url: 'https://cdn.example.org/storage/public?key=dos.mp4' },
      } as never,
      FIXTURE_NOW,
    );
    expect(model.VIDEOS).toHaveLength(2);
    const root = document.createElement('div');
    root.innerHTML = design.html(model, createKit(model));
    const [first, second] = [...root.querySelectorAll('video')];
    expect(first?.getAttribute('src')).toContain('uno.mp4');
    expect(first?.classList.contains('on')).toBe(true);
    expect(first?.hasAttribute('autoplay')).toBe(true);
    expect(second?.getAttribute('src')).toContain('dos.mp4');
    expect(second?.getAttribute('preload')).toBe('none');
    expect(second?.hasAttribute('autoplay')).toBe(false);
  });

  it('sin video: carrete con las fotos reales y sin botón de sonido', async () => {
    const { root } = await render('documental', 'completa');
    expect(root.querySelector('video')).toBeNull();
    expect(root.querySelector('.dc-reel')).not.toBeNull();
    expect(root.querySelector('[data-dc-sound]')).toBeNull();
  });

  it('descarta un video que no es http(s) ni blob', () => {
    expect(withVideo({ url: 'javascript:alert(1)' }).VIDEO).toBeNull();
    expect(withVideo(null).VIDEO).toBeNull();
    expect(withVideo({ url: 'blob:https://adoptafacil.org/abc' }).VIDEO?.src).toContain('blob:');
  });
});
