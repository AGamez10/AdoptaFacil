import {
  brandFromPortalTokens,
  brandedFromName,
  hslChannelToHex,
  safeReplyTo,
  usageMonth,
} from './org-email-branding';
import { renderLayout } from '../templates/email-layout';

describe('org-email-branding (piezas puras)', () => {
  it('convierte el canal HSL del portal a hex y rechaza lo que no es HSL', () => {
    expect(hslChannelToHex('0 0% 100%')).toBe('#ffffff');
    expect(hslChannelToHex('0 0% 0%')).toBe('#000000');
    expect(hslChannelToHex('142 72% 29%')).toBe('#157f3c');
    expect(hslChannelToHex('red')).toBeUndefined();
    expect(hslChannelToHex('120 150% 50%')).toBeUndefined();
    expect(hslChannelToHex(undefined)).toBeUndefined();
  });

  it('el botón cambia solo con el par fondo + texto que el portal ya validó', () => {
    expect(brandFromPortalTokens({ primary: '142 72% 29%' })).toEqual({ accent: '#157f3c' });
    expect(
      brandFromPortalTokens({ primary: '142 72% 29%', 'primary-foreground': '0 0% 100%' }),
    ).toEqual({ accent: '#157f3c', button: '#157f3c', buttonText: '#ffffff' });
    expect(brandFromPortalTokens(null)).toEqual({});
  });

  it('el nombre del remitente no permite inyectar cabeceras ni fingir otra dirección', () => {
    expect(brandedFromName('Huellitas')).toBe('Huellitas vía AdoptaFácil');
    expect(brandedFromName('Malo\r\nBcc: x@y.co <ceo@banco.com> "x"')).toBe(
      'Malo Bcc: x@y.co ceo@banco.com x vía AdoptaFácil',
    );
    expect(brandedFromName('   ')).toBe('AdoptaFácil');
    expect(brandedFromName('x'.repeat(200)).length).toBeLessThanOrEqual(
      60 + ' vía AdoptaFácil'.length,
    );
  });

  it('responder a: solo una dirección simple y válida', () => {
    expect(safeReplyTo(' contacto@huellitas.org ')).toBe('contacto@huellitas.org');
    expect(safeReplyTo('a@b.co, c@d.co')).toBeUndefined();
    expect(safeReplyTo('x@y.co\r\nBcc: z@w.co')).toBeUndefined();
    expect(safeReplyTo('no-es-correo')).toBeUndefined();
    expect(safeReplyTo(null)).toBeUndefined();
  });

  it('el mes del contador es UTC', () => {
    expect(usageMonth(new Date('2026-10-31T23:30:00-05:00'))).toBe('2026-11');
  });
});

describe('email-layout con marca', () => {
  const base = {
    theme: 'donation' as const,
    category: 'transactional' as const,
    preheaderHtml: 'p',
    headingHtml: 'Gracias',
    paragraphsHtml: ['Hola'],
    ctaLabelHtml: 'Ver',
    ctaUrl: 'https://adoptafacil.org/x',
    organizationName: 'Huellitas <script>',
    webBaseUrl: 'https://adoptafacil.org',
  };

  it('con marca: el nombre de la organización encabeza y sus colores pintan barra y botón', () => {
    const html = renderLayout({
      ...base,
      brand: { accent: '#123456', button: '#654321', buttonText: '#ffffff' },
    });
    expect(html).toContain('Huellitas &lt;script&gt;</td>');
    expect(html).toContain('a través de 🐾 Adopta');
    expect(html).toContain('background:#123456');
    expect(html).toContain('bgcolor="#654321"');
    expect(html).not.toContain('<script>');
    // El pie legal no cambia.
    expect(html).toContain('Ley 1581 de 2012');
  });

  it('un color que no es hex se ignora (nunca CSS libre en el correo)', () => {
    const html = renderLayout({
      ...base,
      brand: { accent: 'red;background:url(x)', button: '#12345', buttonText: 'x' },
    });
    expect(html).not.toContain('url(x)');
    expect(html).toContain('bgcolor="#198072"');
  });

  it('sin marca: se ve igual que antes', () => {
    const html = renderLayout(base);
    expect(html).toContain('🐾 Adopta<span');
    expect(html).toContain('Huellitas &lt;script&gt; <span');
  });
});
