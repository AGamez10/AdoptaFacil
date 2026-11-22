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

  it('copia la forma de las tarjetas, el saldo destacado y la letra de las cifras de la plantilla', () => {
    const root = document.createElement('div');
    root.style.backgroundColor = 'rgb(247, 248, 251)';
    root.style.color = 'rgb(20, 24, 31)';
    const tile =
      'background-color: rgb(255, 255, 255); border-top-left-radius: 26px; box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 1px';
    root.innerHTML =
      `<section data-sec="libro"><h2>Libro</h2><div class="af-led"><dl>` +
      `<div style="${tile}"><dt>Recibido</dt><dd style="font-family: Sora; font-weight: 800; font-size: 20px; letter-spacing: -1px">$ 1</dd></div>` +
      `<div style="${tile}"><dt>Gastado</dt><dd>$ 1</dd></div>` +
      `<div style="background-color: rgb(25, 128, 114); color: rgb(255, 255, 255)"><dt>Saldo</dt><dd>$ 0</dd></div>` +
      `</dl></div></section>`;
    document.body.appendChild(root);
    const theme = readLedgerTheme(root);
    root.remove();
    expect(theme).toMatchObject({
      radius: 'min(26px, 22px)',
      card: { bg: 'rgb(255, 255, 255)', shadow: 'rgba(0, 0, 0, 0.1) 0px 0px 0px 1px' },
      highlight: { bg: 'rgb(25, 128, 114)', ink: 'rgb(255, 255, 255)' },
      figures: { font: 'Sora', weight: '800', spacing: '-0.05em' },
    });
    expect(ledgerThemeStyle(theme!)).toMatchObject({
      '--led-card': 'rgb(255, 255, 255)',
      '--led-hi': 'rgb(25, 128, 114)',
      '--led-num-w': '800',
    });
  });

  it('un saldo que no se lee bien no se copia', () => {
    const root = document.createElement('div');
    root.style.backgroundColor = 'rgb(255, 255, 255)';
    root.style.color = 'rgb(20, 20, 20)';
    root.innerHTML =
      '<section data-sec="libro"><div class="af-led"><dl><div><dd>1</dd></div><div><dd>2</dd></div>' +
      '<div style="background-color: rgb(250, 250, 120); color: rgb(255, 255, 255)"><dd>3</dd></div></dl></div></section>';
    document.body.appendChild(root);
    const theme = readLedgerTheme(root);
    root.remove();
    expect(theme?.highlight).toBeUndefined();
  });

  it('sin plantilla montada no inventa apariencia', () => {
    expect(readLedgerTheme(null)).toBeNull();
  });
});
