import { describe, expect, it } from 'vitest';
import { PORTAL_TEMPLATE_IDS } from '@adoptafacil/contracts';
import { PROFILES, FIXTURE_NOW } from './__fixtures__/profiles';
import { createKit } from './engine/kit';
import { buildTemplateModel } from './engine/model';
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

  it('son 14 diseños nuevos además de la clásica', () => {
    expect(DESIGN_IDS).toHaveLength(14);
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
