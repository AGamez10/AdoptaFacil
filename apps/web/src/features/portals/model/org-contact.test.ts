import { describe, expect, it } from 'vitest';
import { orgMailtoUrl, orgWhatsappUrl } from './org-contact';

describe('orgWhatsappUrl', () => {
  it('builds a wa.me link from digits, adding +57 to a 10-digit Colombian mobile', () => {
    expect(orgWhatsappUrl('300 123 4567')).toBe('https://wa.me/573001234567');
    expect(orgWhatsappUrl('+57 (300) 123-4567', 'Hola')).toBe(
      'https://wa.me/573001234567?text=Hola',
    );
  });

  it('never turns free text into a link', () => {
    expect(orgWhatsappUrl('javascript:alert(1)')).toBeNull();
    expect(orgWhatsappUrl('123')).toBeNull();
    expect(orgWhatsappUrl(undefined)).toBeNull();
  });
});

describe('orgMailtoUrl', () => {
  it('accepts a plain email and rejects anything that could inject', () => {
    expect(orgMailtoUrl('hola@refugio.org')).toBe('mailto:hola@refugio.org');
    expect(orgMailtoUrl('a@b.co?bcc=x@y.co')).toBeNull();
    expect(orgMailtoUrl('javascript:alert(1)//@x.co')).toBeNull();
    expect(orgMailtoUrl('')).toBeNull();
  });
});
