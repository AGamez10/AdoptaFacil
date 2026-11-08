import { coffeeContributionPerUnit, coffeeQrUrl } from '@adoptafacil/contracts';
import { newCoffeeCode, parseQrDomains, unitsHeld } from './coffee-admin.service';
import { newCoffeeReference } from './coffee-public.service';

describe('café: reglas', () => {
  it('aporta el 20 % del margen bruto, redondeado al peso (precios reales del lote 2)', () => {
    expect(coffeeContributionPerUnit(27_999, 17_000)).toBe(2_200);
    expect(coffeeContributionPerUnit(41_000, 31_000)).toBe(2_000);
  });

  it('sin margen no hay aporte (nunca negativo)', () => {
    expect(coffeeContributionPerUnit(17_000, 17_000)).toBe(0);
    expect(coffeeContributionPerUnit(15_000, 17_000)).toBe(0);
  });

  it('cuenta pagadas y apartadas vigentes; las vencidas liberan la bolsa', () => {
    const now = new Date('2026-11-08T10:00:00Z');
    const later = new Date('2026-11-08T10:10:00Z');
    const earlier = new Date('2026-11-08T09:50:00Z');
    expect(
      unitsHeld(
        [
          { status: 'paid', quantity: 3, reservedUntil: earlier },
          { status: 'pending', quantity: 2, reservedUntil: later },
          { status: 'pending', quantity: 4, reservedUntil: earlier },
          { status: 'rejected', quantity: 1, reservedUntil: later },
          { status: 'needs_refund', quantity: 1, reservedUntil: later },
        ],
        now,
      ),
    ).toEqual({ sold: 3, reserved: 2 });
  });

  it('solo acepta dominios bien formados para el QR', () => {
    expect(parseQrDomains('adoptafacil.org, Dominio.com ,mal dominio,localhost')).toEqual([
      'adoptafacil.org',
      'dominio.com',
    ]);
  });

  it('códigos y referencias con el alfabeto sin caracteres confusos', () => {
    expect(newCoffeeCode()).toMatch(/^[a-hjkmnp-z2-9]{8}$/);
    expect(newCoffeeReference()).toMatch(/^cafe-[a-hjkmnp-z2-9]{24}$/);
    expect(coffeeQrUrl('adoptafacil.org', 'abcdefgh')).toBe('https://adoptafacil.org/c/abcdefgh');
  });
});
