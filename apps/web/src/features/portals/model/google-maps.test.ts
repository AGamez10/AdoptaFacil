import { describe, expect, it } from 'vitest';
import { googleMapsEmbedFromAddress, isGoogleMapsUrl, toGoogleMapsEmbedUrl } from './google-maps';

describe('isGoogleMapsUrl', () => {
  it('recognizes google.com/maps and maps.google.com URLs', () => {
    expect(isGoogleMapsUrl('https://www.google.com/maps/place/Bogota')).toBe(true);
    expect(isGoogleMapsUrl('https://maps.google.com/?q=Bogota')).toBe(true);
  });

  it('rejects non-Google-Maps URLs', () => {
    expect(isGoogleMapsUrl('https://www.openstreetmap.org/way/123')).toBe(false);
    expect(isGoogleMapsUrl('https://www.google.com/search?q=bogota')).toBe(false);
    expect(isGoogleMapsUrl('not a url')).toBe(false);
  });
});

describe('toGoogleMapsEmbedUrl (S2-REORG: fixes the "refused to connect" iframe)', () => {
  it('returns an already-embed URL unchanged', () => {
    const embed = 'https://maps.google.com/maps?q=Bogota&output=embed';
    expect(toGoogleMapsEmbedUrl(embed)).toBe(embed);
    const embedPath = 'https://www.google.com/maps/embed?pb=!1m18!blah';
    expect(toGoogleMapsEmbedUrl(embedPath)).toBe(embedPath);
  });

  it('converts a ?q= share URL to an embeddable one', () => {
    expect(toGoogleMapsEmbedUrl('https://maps.google.com/?q=Bogota,+Colombia')).toBe(
      'https://maps.google.com/maps?q=Bogota%2C%20Colombia&output=embed',
    );
  });

  it('converts a /maps/place/<name>/... URL by extracting the place name', () => {
    expect(
      toGoogleMapsEmbedUrl('https://www.google.com/maps/place/Refugio+Patitas/@4.6,-74.1,15z'),
    ).toBe('https://maps.google.com/maps?q=Refugio%20Patitas&output=embed');
  });

  it('converts a bare coordinates URL (no name/query) using the exact lat/lng in the URL (2da iteración)', () => {
    expect(toGoogleMapsEmbedUrl('https://www.google.com/maps/@4.6,-74.1,15z')).toBe(
      'https://maps.google.com/maps?q=4.6%2C-74.1&output=embed',
    );
  });

  it('returns null for a non-Google-Maps URL — caller must fall back to a plain link', () => {
    expect(toGoogleMapsEmbedUrl('https://www.openstreetmap.org/way/123')).toBeNull();
  });

  it('returns null for an invalid URL', () => {
    expect(toGoogleMapsEmbedUrl('not a url')).toBeNull();
  });

  it('returns null for a maps.app.goo.gl SHORT link — cannot be resolved without a network round trip, and embedding it would just hit the "refused to connect" block again (documented limitation, not a bug)', () => {
    expect(toGoogleMapsEmbedUrl('https://maps.app.goo.gl/AbCdEfGh123')).toBeNull();
  });
});

describe('googleMapsEmbedFromAddress (mapa visible sin hacer clic)', () => {
  it('arma el embed con la dirección y los extras que existan', () => {
    expect(
      googleMapsEmbedFromAddress('Cl. 58i Bis Sur # 78B-15', 'Bogotá', undefined, 'Colombia'),
    ).toBe(
      'https://maps.google.com/maps?q=Cl.%2058i%20Bis%20Sur%20%23%2078B-15%2C%20Bogot%C3%A1%2C%20Colombia&output=embed',
    );
  });

  it('sin dirección no inventa nada (null)', () => {
    expect(googleMapsEmbedFromAddress(undefined, 'Bogotá')).toBeNull();
    expect(googleMapsEmbedFromAddress('   ', 'Bogotá')).toBeNull();
  });
});

// Security remediation `web/portals/google-maps-embed-host-suffix-bypass`.
describe('lookalike hosts never reach the map iframe', () => {
  it.each([
    'https://maps.google.evil.com/maps/embed?pb=x',
    'https://maps.google.attacker.example/?output=embed',
    'https://google.evil.com/maps/embed?pb=x',
    'https://www.google.com.evil.co/maps/embed?pb=x',
    'https://evilgoogle.com/maps/embed?pb=x',
    'https://www.google.com@evil.com/maps/embed?pb=x',
    'https://user:pass@www.google.com/maps/embed?pb=x',
    'https://www.google.com:8443/maps/embed?pb=x',
    'javascript://www.google.com/maps/embed?pb=x',
  ])('%s is not a Google Maps URL and gets no iframe', (raw) => {
    expect(isGoogleMapsUrl(raw)).toBe(false);
    expect(toGoogleMapsEmbedUrl(raw)).toBeNull();
  });

  it('keeps accepting Google Maps on its regional domains', () => {
    expect(isGoogleMapsUrl('https://www.google.com.co/maps/place/Bogota')).toBe(true);
    expect(isGoogleMapsUrl('https://maps.google.com.co/?q=Bogota')).toBe(true);
  });

  it('rebuilds embed URLs on a fixed Google host (query kept, nothing else)', () => {
    expect(toGoogleMapsEmbedUrl('https://www.google.com.co/maps/embed?pb=!1m18#frag')).toBe(
      'https://www.google.com/maps/embed?pb=!1m18',
    );
    expect(toGoogleMapsEmbedUrl('https://maps.google.es/maps?q=Cali&output=embed')).toBe(
      'https://maps.google.com/maps?q=Cali&output=embed',
    );
  });
});
