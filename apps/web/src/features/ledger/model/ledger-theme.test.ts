import { describe, expect, it } from 'vitest';
import { contrast, ledgerThemeStyle, parseColor, readLedgerTheme } from './ledger-theme';

describe('apariencia del libro según la plantilla', () => {
  it('lee colores calculados (rgb, rgba y el formato con barra)', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30, 1]);
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30, 0.5]);
    expect(parseColor('rgb(10 20 30 / 40%)')).toEqual([10, 20, 30, 0.4]);
    expect(parseColor('transparent')).toBeNull();
  });

  it('mide el contraste como WCAG', () => {
    expect(contrast([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(21, 0);
  });

  it('toma fondo, tinta y acento de la sección del libro', () => {
    const root = document.createElement('div');
    root.style.backgroundColor = 'rgb(12, 10, 10)';
    root.style.color = 'rgb(250, 240, 235)';
    root.innerHTML =
      '<a id="portal-help-cta" style="background-color: rgb(255, 90, 70); color: rgb(20, 10, 10)">Ayuda</a><section data-sec="libro"><h2>Libro</h2></section>';
    document.body.appendChild(root);
    const theme = readLedgerTheme(root);
    root.remove();
    expect(theme).toMatchObject({
      bg: 'rgb(12, 10, 10)',
      ink: 'rgb(250, 240, 235)',
      accent: 'rgb(255, 90, 70)',
      accentInk: 'rgb(20, 10, 10)',
      scheme: 'dark',
    });
    expect(ledgerThemeStyle(theme!)).toMatchObject({ '--led-bg': 'rgb(12, 10, 10)' });
  });

  it('sin plantilla montada no inventa apariencia', () => {
    expect(readLedgerTheme(null)).toBeNull();
  });
});
