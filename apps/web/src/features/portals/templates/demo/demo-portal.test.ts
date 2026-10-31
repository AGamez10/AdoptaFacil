import { describe, expect, it } from 'vitest';
import { buildDemoSource, DEMO_SLUG } from './demo-portal';

describe('demo portal data', () => {
  it('fills every section and stays out of real data', () => {
    const src = buildDemoSource(Date.parse('2026-10-30T00:00:00Z'));
    expect(src.animals.length).toBeGreaterThan(6);
    expect(src.campaigns.length).toBeGreaterThan(0);
    expect(src.needs.length).toBeGreaterThan(0);
    expect(src.ledger?.items.length).toBeGreaterThan(0);
    // Los slugs reales no aceptan "--": el de ejemplo no puede chocar con uno real.
    expect(DEMO_SLUG).toContain('--');
    expect(src.animals.every((a) => a.id.startsWith('demo-'))).toBe(true);
    expect(src.campaigns.every((c) => Date.parse(c.deadline) > Date.parse('2026-10-30'))).toBe(
      true,
    );
  });
});

describe('demo portal count', () => {
  it('announces exactly the animals it shows', () => {
    const src = buildDemoSource(Date.parse('2026-10-30T00:00:00Z'));
    expect(src.animalTotal).toBe(src.animals.length);
    // Más de una página de los catálogos (12): se ve "Cargar más" hasta el último.
    expect(src.animals.length).toBeGreaterThan(12);
  });
});
