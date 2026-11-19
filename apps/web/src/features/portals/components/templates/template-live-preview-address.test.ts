import { describe, expect, it } from 'vitest';
import { portalPreviewAddress } from './template-live-preview';

/** La barra de la vista previa muestra una dirección que de verdad abre el portal. */
describe('portalPreviewAddress', () => {
  it('sin subdominios encendidos muestra la ruta que siempre funciona (/o/slug)', () => {
    expect(portalPreviewAddress('patitas-felices', undefined, 'adoptafacil.org')).toBe(
      'adoptafacil.org/o/patitas-felices',
    );
  });
  it('con subdominios encendidos muestra slug.dominio', () => {
    expect(portalPreviewAddress('patitas', 'adoptafacil.org', 'adoptafacil.org')).toBe(
      'patitas.adoptafacil.org',
    );
  });
  it('con dominio propio verificado muestra ese dominio', () => {
    expect(
      portalPreviewAddress('patitas', 'adoptafacil.org', 'adoptafacil.org', 'www.patitas.org'),
    ).toBe('www.patitas.org');
  });
});
