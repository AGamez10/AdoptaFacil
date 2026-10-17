import { EMAIL_EVENT_KEYS } from '@adoptafacil/contracts';
import { EMAIL_CATALOG, getEmailEvent } from './email-catalog';
import {
  buildUnsubscribeUrl,
  composeEmail,
  hashEmail,
  signUnsubscribe,
  verifyUnsubscribe,
} from './email-compose';
import {
  exampleValues,
  formatValue,
  renderInlineHtml,
  renderPlain,
  safeUrl,
  validateContent,
} from './email-render';

const WEB = 'https://app.adoptafacil.test';

function def(event: string) {
  const found = getEmailEvent(event);
  if (!found) throw new Error(`missing ${event}`);
  return found;
}

describe('email catalog', () => {
  it('covers every event key of the contract exactly once', () => {
    expect(EMAIL_CATALOG.map((d) => d.event).sort()).toEqual([...EMAIL_EVENT_KEYS].sort());
  });

  it.each(EMAIL_CATALOG.map((d) => [d.event, d] as const))(
    '%s: default copy is valid against its own variables',
    (_event, d) => {
      expect(validateContent(d, d.defaults)).toEqual([]);
    },
  );

  it('only bulk events are bulk; password reset is the required one', () => {
    expect(
      EMAIL_CATALOG.filter((d) => d.category === 'bulk')
        .map((d) => d.event)
        .sort(),
    ).toEqual(['community.campaign_update', 'platform.announcement']);
    expect(EMAIL_CATALOG.filter((d) => d.required).map((d) => d.event)).toEqual([
      'auth.password_reset',
    ]);
  });

  it('a button URL variable is always declared as a url variable', () => {
    for (const d of EMAIL_CATALOG) {
      if (!d.ctaUrlVariable) continue;
      expect(d.variables.find((v) => v.name === d.ctaUrlVariable)?.kind).toBe('url');
    }
  });
});

describe('validateContent', () => {
  const donation = def('donation.thanks');
  const base = { ...donation.defaults };

  it('rejects variables the event does not declare', () => {
    const errors = validateContent(donation, { ...base, body: 'Hola {{contrasena}}' });
    expect(errors.join(' ')).toContain('{{contrasena}}');
  });

  it('rejects malformed braces', () => {
    expect(validateContent(donation, { ...base, body: 'Hola {{nombre' })).not.toEqual([]);
    expect(validateContent(donation, { ...base, body: 'Hola {{ 1x }}' })).not.toEqual([]);
  });

  it('rejects line breaks in one-line fields (no header injection)', () => {
    const errors = validateContent(donation, { ...base, subject: 'Hola\r\nBcc: victima@x.co' });
    expect(errors.join(' ')).toContain('una sola línea');
  });

  it('rejects a button label on an event without a button URL', () => {
    const errors = validateContent(def('sponsorship.charge'), {
      ...def('sponsorship.charge').defaults,
      ctaLabel: 'Pagar aquí',
    });
    expect(errors.join(' ')).toContain('no lleva botón');
  });

  it('enforces lengths', () => {
    expect(validateContent(donation, { ...base, body: 'x'.repeat(5001) })).not.toEqual([]);
  });
});

describe('rendering is injection-safe', () => {
  it('escapes HTML typed in the template itself', () => {
    const html = renderInlineHtml('<script>alert(1)</script><a href="https://evil.co">x</a>', {});
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<a ');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in variable values and never lets a value open bold', () => {
    const html = renderInlineHtml('Hola **{{nombre}}**', {
      nombre: '<img src=x onerror=alert(1)> **x**',
    });
    expect(html).toContain(
      '<strong>&lt;img src=x onerror=alert(1)&gt; &#42;&#42;x&#42;&#42;</strong>',
    );
  });

  it('supports **bold** and line breaks from the template', () => {
    expect(renderInlineHtml('a **b**\nc', {})).toBe('a <strong>b</strong><br>c');
  });

  it('drops CR/LF and control chars from one-line output (subject)', () => {
    expect(renderPlain('Hola {{nombre}}', { nombre: 'Ana\r\nBcc: x@y.co' }, true)).toBe(
      'Hola Ana Bcc: x@y.co',
    );
    expect(renderPlain('A\u0000B‮C', {}, true)).toBe('ABC');
  });

  it('only accepts absolute http(s) URLs', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,hi')).toBe('');
    expect(safeUrl('/relative')).toBe('');
    expect(safeUrl('https://ok.co/a?b=1')).toBe('https://ok.co/a?b=1');
  });

  it('formats money in COP and dates in Colombia time (presentation only)', () => {
    expect(formatValue('money', 50000).replace(/\s/g, ' ')).toBe('$ 50.000');
    // 2026-10-02T03:30Z is still Oct 1st in Bogotá (UTC-5).
    expect(formatValue('date', '2026-10-02T03:30:00.000Z')).toContain('1 de octubre de 2026');
    expect(formatValue('money', 'abc')).toBe('');
  });
});

describe('composeEmail', () => {
  it('builds a branded donation thank-you with org name, amount and a safe button', () => {
    const d = def('donation.thanks');
    const email = composeEmail(
      d,
      d.defaults,
      { monto: 50000, enlace: 'https://app.adoptafacil.test/donaciones/comprobante?token=abc' },
      { organizationName: 'Huellitas <b>', webBaseUrl: WEB },
    );
    expect(email.subject).toBe('¡Gracias por tu donación a Huellitas <b>!');
    expect(email.html).toContain('Huellitas &lt;b&gt;');
    expect(email.html).not.toContain('Huellitas <b>');
    expect(email.html).toContain(
      'href="https://app.adoptafacil.test/donaciones/comprobante?token=abc"',
    );
    expect(email.html).toContain('Ley 1581');
    expect(email.text).toContain(
      'Ver mi comprobante: https://app.adoptafacil.test/donaciones/comprobante?token=abc',
    );
    expect(email.text).not.toContain('**');
  });

  it('uses the accent color and icon chosen in the editor, else the theme ones', () => {
    const d = def('donation.thanks');
    const data = { monto: 1, enlace: 'https://app.adoptafacil.test/x' };
    const themed = composeEmail(d, d.defaults, data, { webBaseUrl: WEB });
    expect(themed.html).toContain('background:#FF8F66;');
    expect(themed.html).toContain('💛');
    const custom = composeEmail(d, { ...d.defaults, accentColor: 'purple', icon: '🎉' }, data, {
      webBaseUrl: WEB,
    });
    expect(custom.html).toContain('background:#8E6CC8;');
    expect(custom.html).toContain('🎉');
    expect(custom.html).not.toContain('background:#FF8F66;');
  });

  it('omits the button when the URL value is unsafe', () => {
    const d = def('donation.thanks');
    const email = composeEmail(
      d,
      d.defaults,
      { monto: 1, enlace: 'javascript:alert(1)' },
      { webBaseUrl: WEB },
    );
    expect(email.html).not.toContain('javascript:');
    expect(email.html).not.toContain('Ver mi comprobante');
  });

  it('bulk emails carry the unsubscribe link; transactional ones do not', () => {
    const bulk = def('community.campaign_update');
    const unsub = buildUnsubscribeUrl(WEB, 'secret', 'Ana@Example.co');
    const email = composeEmail(bulk, bulk.defaults, exampleValues(bulk.variables), {
      webBaseUrl: WEB,
      unsubscribeUrl: unsub,
    });
    expect(email.html).toContain(unsub.replace(/&/g, '&amp;'));
    expect(email.text).toContain(unsub);
    const tx = def('adoption.status_changed');
    const txEmail = composeEmail(tx, tx.defaults, exampleValues(tx.variables), {
      webBaseUrl: WEB,
      unsubscribeUrl: unsub,
    });
    expect(txEmail.html).not.toContain('/correo/baja');
    expect(txEmail.html).toContain('no es publicidad');
  });
});

describe('unsubscribe tokens', () => {
  it('verifies only the matching HMAC for that address hash', () => {
    const h = hashEmail(' Ana@Example.co ');
    expect(h).toBe(hashEmail('ana@example.co'));
    const t = signUnsubscribe('secret', h);
    expect(verifyUnsubscribe('secret', h, t)).toBe(true);
    expect(verifyUnsubscribe('other-secret', h, t)).toBe(false);
    expect(verifyUnsubscribe('secret', hashEmail('otra@example.co'), t)).toBe(false);
    expect(verifyUnsubscribe('secret', 'not-a-hash', t)).toBe(false);
    expect(verifyUnsubscribe('secret', h, 'short')).toBe(false);
  });

  it('the link never contains the address itself', () => {
    const url = buildUnsubscribeUrl(WEB, 'secret', 'ana@example.co');
    expect(url).not.toContain('ana');
    expect(url).toMatch(/\/correo\/baja\?h=[0-9a-f]{64}&t=[A-Za-z0-9_-]{43}$/);
  });
});

describe('regressions', () => {
  it('previews format example values once (money/date are not blanked)', () => {
    const d = def('donation.thanks');
    const email = composeEmail(d, d.defaults, exampleValues(d.variables), { webBaseUrl: WEB });
    expect(email.text.replace(/\s/g, ' ')).toContain('Tu donación de $ 50.000 a');
    const signed = def('adoption.contract_signed');
    const c = composeEmail(signed, signed.defaults, exampleValues(signed.variables), {
      webBaseUrl: WEB,
    });
    expect(c.text).toContain('8 de octubre de 2026');
  });

  it('an empty value inside **bold** leaves no stray asterisks', () => {
    expect(renderInlineHtml('Total **{{monto}}** hoy', { monto: '' })).toBe('Total  hoy');
  });
});
