import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PROFILES, FIXTURE_NOW } from './__fixtures__/profiles';
import type { PortalPremiumTemplateId } from '@adoptafacil/contracts';
import { createKit } from './engine/kit';
import { buildTemplateModel } from './engine/model';
import { createCatalog, createMotion } from './engine/runtime';
import { esc, safeHref, safeImgSrc, unesc } from './engine/safe';
import type { TemplateDesign } from './engine/types';
import {
  isDesignId,
  loadDesign,
  loadPremiumDesign,
  PREMIUM_CATALOG,
  PREMIUM_TEMPLATES_ENABLED,
  safeTemplateId,
  TEMPLATE_CATALOG,
} from './registry';

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

// jsdom no tiene lienzo: las plantillas ya toleran un `getContext` nulo (sin animación).
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

const DESIGN_IDS = TEMPLATE_CATALOG.map((t) => t.id).filter(isDesignId);
const PREMIUM_IDS = PREMIUM_CATALOG.map((t) => t.id);

type Profile = keyof typeof PROFILES;
/** Las gratuitas se pintan una vez; cada Premium en sus dos experiencias. */
type Case = [name: string, load: () => Promise<TemplateDesign>, mode: 'light' | 'dark' | null];
const CASES: Case[] = [
  ...DESIGN_IDS.map((id): Case => [id, () => loadDesign(id), null]),
  ...PREMIUM_IDS.flatMap((id) =>
    (['light', 'dark'] as const).map((mode): Case => [
      `${id} (${mode})`,
      () => loadPremiumDesign(id),
      mode,
    ]),
  ),
];

async function renderWith(
  load: () => Promise<TemplateDesign>,
  mode: 'light' | 'dark' | null,
  profile: Profile,
) {
  const design = await load();
  const model = buildTemplateModel(PROFILES[profile], FIXTURE_NOW);
  const root = document.createElement('div');
  const kit = createKit(model);
  root.innerHTML = design.html(model, kit);
  if (mode) {
    // El modo se pinta montando la plantilla como en el portal (init con la preferencia guardada).
    localStorage.setItem(`af-tpl-mode:${design.id}`, mode);
    const ctl = new AbortController();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    document.body.appendChild(root);
    design.init?.(root, {
      m: model,
      kit,
      motion: createMotion(ctl.signal),
      catalog: createCatalog(model.ANIMALS),
      THREE: null,
      brand: () => '#1F7A6D',
      go: () => undefined,
    });
    // Una animación que falla no debe pasar desapercibida en las pruebas.
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    ctl.abort();
    root.remove();
    localStorage.removeItem(`af-tpl-mode:${design.id}`);
    expect(root.dataset.mode).toBe(mode);
  }
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

  it('las Premium están apagadas: no se ofrecen, no se cargan y se leen como clásico', async () => {
    expect(PREMIUM_TEMPLATES_ENABLED).toBe(false);
    expect(PREMIUM_IDS).toHaveLength(5);
    const free: readonly string[] = TEMPLATE_CATALOG.map((t) => t.id);
    for (const id of PREMIUM_IDS) {
      expect(free).not.toContain(id);
      expect(safeTemplateId(id)).toBe('clasico');
      await expect(loadDesign(id as PortalPremiumTemplateId)).rejects.toThrow('premium-disabled');
    }
  });

  it('asigna cada Premium a su plan: Álbum y Revelado en Crece; Velitas, Linterna y Terminal en Pro', () => {
    expect(PREMIUM_CATALOG.map((t) => [t.id, t.plan])).toEqual([
      ['album', 'crece'],
      ['revelado', 'crece'],
      ['velitas', 'pro'],
      ['linterna', 'pro'],
      ['terminal', 'pro'],
    ]);
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

describe.each(CASES)('plantilla %s', (_name, load, mode) => {
  const render = (profile: Profile) => renderWith(load, mode, profile);

  it('completa: pinta las 12 secciones', async () => {
    const { root } = await render('completa');
    expect([...sectionsOf(root)].sort()).toEqual([...SECTIONS].sort());
    expect(root.querySelector('#portal-help-cta')).not.toBeNull();
  });

  it.each(['nueva', 'vacia'] as const)(
    '%s: oculta exactamente lo que el clásico oculta',
    async (profile) => {
      const { root, model } = await render(profile);
      const hidden = (['transparencia', 'nosotros', 'contacto', 'redes'] as const).filter(
        (s) => !model.SHOW[s],
      );
      const expected = SECTIONS.filter((s) => !hidden.includes(s as (typeof hidden)[number]));
      expect([...sectionsOf(root)].sort()).toEqual([...expected].sort());
    },
  );

  it('vacia: no inventa sellos, cifras ni reseñas', async () => {
    const { root, model } = await render('vacia');
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
    const { root } = await render('hostil');
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
