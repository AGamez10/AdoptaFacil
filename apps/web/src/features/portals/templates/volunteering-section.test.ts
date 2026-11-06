import { describe, expect, it } from 'vitest';
import type { VolunteerOpportunityPublic } from '@adoptafacil/contracts';
import { PROFILES, FIXTURE_NOW } from './__fixtures__/profiles';
import { createKit, ensureVolunteeringSection } from './engine/kit';
import { buildTemplateModel } from './engine/model';
import { ENGINE_TEMPLATE_IDS, loadDesign } from './registry';

const VOLUNTEERING: VolunteerOpportunityPublic[] = [
  {
    id: 'vo-1',
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas Felices',
    title: 'Jornada de baños <script>alert(1)</script>',
    category: 'care',
    startDate: '2026-11-01T00:00:00.000Z',
    endDate: '2026-11-30T00:00:00.000Z',
    location: 'Sede norte',
    appliesToStudentService: true,
    sessionDates: ['2026-11-08', '2026-11-15'],
  },
];

/**
 * Voluntariado en las plantillas del portal: TODAS lo muestran (la vista lo
 * inserta antes del pie si el diseño no lo pinta), con datos saneados.
 */
describe('voluntariado en las plantillas del portal', () => {
  const model = buildTemplateModel(
    { ...PROFILES.completa, volunteering: VOLUNTEERING },
    FIXTURE_NOW,
  );
  const kit = createKit(model);

  it('la sección lista la convocatoria con sus días de jornada y el enlace de inscripción', () => {
    const root = document.createElement('div');
    root.innerHTML = kit.volunteering();
    const section = root.querySelector('[data-sec="voluntariado"]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain(
      'Jornadas: 8 de noviembre de 2026 · 15 de noviembre de 2026',
    );
    expect(section?.textContent).toContain('Servicio social estudiantil');
    expect(section?.querySelector('a')?.getAttribute('href')).toBe(
      '/voluntariado?oportunidad=vo-1',
    );
    // Un título hostil se muestra como texto, nunca como marcado.
    expect(root.querySelector('script')).toBeNull();
  });

  it('sin voluntariados no se pinta nada', () => {
    const empty = createKit(buildTemplateModel(PROFILES.completa, FIXTURE_NOW));
    expect(empty.volunteering()).toBe('');
  });

  it.each(ENGINE_TEMPLATE_IDS)(
    '%s: la sección cabe en el diseño (antes del pie o al final)',
    async (id) => {
      const design = await loadDesign(id);
      const root = document.createElement('div');
      root.innerHTML = design.html(model, kit);
      ensureVolunteeringSection(root, kit);
      const sections = root.querySelectorAll('[data-sec="voluntariado"]');
      expect(sections).toHaveLength(1);
      // Si el diseño tiene pie de página, la sección queda antes de él.
      const footer = root.querySelector('footer');
      if (footer) {
        expect(
          sections[0].compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    },
  );
});
