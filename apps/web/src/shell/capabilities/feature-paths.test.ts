import { describe, expect, it } from 'vitest';
import { featureForPath } from './feature-paths';

describe('featureForPath (Ola 1, R1-1)', () => {
  it.each([
    ['/donaciones', 'payments'],
    ['/donaciones/comprobante', 'payments'],
    ['/mis-donaciones', 'payments'],
    ['/donaciones-recibidas', 'payments'],
    ['/certificado', 'donationCertificates'],
    ['/verificar/ABC123', 'donationCertificates'],
    ['/apadrinar', 'sponsorships'],
    ['/organizacion/apadrinamientos', 'sponsorships'],
    ['/recursos/123', 'resources'],
    ['/ofrecer', 'resources'],
    ['/marketplace', 'marketplace'],
    ['/organizacion/marketplace/9', 'marketplace'],
    ['/comunidad/42', 'community'],
    ['/plataforma/comunidad', 'community'],
    ['/resenas', 'reputation'],
    ['/organizaciones/patitas/resenas', 'reputation'],
    ['/plataforma/resenas', 'reputation'],
  ])('%s belongs to %s', (path, feature) => {
    expect(featureForPath(path)).toBe(feature);
  });

  it.each([
    '/',
    '/inicio',
    '/campanas',
    '/campanas/1',
    '/animales',
    '/adopciones',
    '/voluntariado',
    '/organizacion',
    '/organizacion/campanas',
    '/o/patitas',
    '/login',
    // Prefixes only match whole segments.
    '/donacionesx',
    '/recursos-humanos',
  ])('%s is not gated', (path) => {
    expect(featureForPath(path)).toBeNull();
  });
});
