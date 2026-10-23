import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROFILES, FIXTURE_NOW } from './__fixtures__/profiles';
import { createKit } from './engine/kit';
import { buildTemplateModel } from './engine/model';
import { esc, safeHref, safeImgSrc, unesc } from './engine/safe';
import { isDesignId, loadDesign, safeTemplateId, TEMPLATE_CATALOG } from './registry';

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

const DESIGN_IDS = TEMPLATE_CATALOG.map((t) => t.id).filter(isDesignId);

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
  it('tiene las mismas plantillas que acepta la API (PORTAL_TEMPLATE_IDS)', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../../../api/src/modules/portals/portals.schemas.ts'),
      'utf8',
    );
    const block = /PORTAL_TEMPLATE_IDS = \[([\s\S]*?)\]/.exec(src)?.[1] ?? '';
    const apiIds = [...block.matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
    expect(TEMPLATE_CATALOG.map((t) => t.id)).toEqual(apiIds);
  });

  it('expone 14 diseños además del clásico', () => {
    expect(DESIGN_IDS).toHaveLength(14);
  });

  it('normaliza un id desconocido a clásico', () => {
    expect(safeTemplateId('cine')).toBe('cine');
    expect(safeTemplateId('premium')).toBe('clasico');
    expect(safeTemplateId('<script>')).toBe('clasico');
    expect(safeTemplateId(undefined)).toBe('clasico');
  });
});

describe('saneo de enlaces e imágenes', () => {
  it('escapa y des-escapa texto', () => {
    const raw = `<b a="1" b='2'>&\``;
    expect(esc(raw)).not.toMatch(/[<>"'`]/);
    expect(unesc(esc(raw))).toBe(raw);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,x',
    '//evil.example',
    'vbscript:x',
  ])('rechaza %s', (raw) => {
    expect(safeHref(raw)).toBeNull();
    expect(safeImgSrc(raw)).toBeNull();
  });

  it('acepta rutas internas y http(s), y pide las imágenes siempre por https', () => {
    expect(safeHref('/o/patitas')).toBe('/o/patitas');
    expect(safeHref('https://x.example/a?b=1&c=2')).toBe('https://x.example/a?b=1&amp;c=2');
    expect(safeImgSrc('http://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
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
