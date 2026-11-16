import { describe, expect, it } from 'vitest';
import { portalPreviewAddress } from './template-live-preview';

describe('dirección de la vista previa del portal', () => {
  it('sin subdominios activos muestra la ruta que de verdad funciona', () => {
    expect(portalPreviewAddress('patitas-felices', 'patitas', '', 'adoptafacil.org')).toBe(
      'adoptafacil.org/o/patitas-felices',
    );
  });

  it('con subdominios activos y uno elegido, muestra el subdominio', () => {
    expect(
      portalPreviewAddress('patitas-felices', 'patitas', 'adoptafacil.org', 'adoptafacil.org'),
    ).toBe('patitas.adoptafacil.org');
  });

  it('con subdominios activos pero sin uno elegido, sigue con /o/<slug>', () => {
    expect(
      portalPreviewAddress('patitas-felices', undefined, 'adoptafacil.org', 'adoptafacil.org'),
    ).toBe('adoptafacil.org/o/patitas-felices');
  });
});
