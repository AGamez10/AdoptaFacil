import { isAllowedMapUrl } from './map-url';

describe('isAllowedMapUrl (run-2 R-05)', () => {
  it.each([
    'https://www.google.com/maps/place/Refugio/@4.6,-74.1,15z',
    'https://maps.google.com/maps?q=4.6,-74.1',
    'https://www.google.com.co/maps/@4.6,-74.1,15z',
    'https://maps.app.goo.gl/AbCdEf123',
    'https://goo.gl/maps/AbCdEf123',
    'https://www.openstreetmap.org/#map=15/4.6/-74.1',
    'https://maps.apple.com/?q=Refugio',
    'https://ul.waze.com/ul?ll=4.6,-74.1',
    'https://www.bing.com/maps?q=Refugio',
    'http://maps.google.com/maps?q=Medellin',
  ])('accepts a real map link: %s', (url) => {
    expect(isAllowedMapUrl(url)).toBe(true);
  });

  it.each([
    'https://evil.com/maps',
    'https://maps.google.evil.com/maps',
    'https://google.com.evil.co/maps',
    'https://www.google.com/search?q=phishing',
    'https://goo.gl/AbCdEf',
    'https://www.bing.com/search?q=x',
    'https://user:pass@maps.google.com/maps',
    'https://maps.google.com:8443/maps',
    'javascript:alert(1)',
    'ftp://maps.google.com/maps',
    'no es un enlace',
  ])('rejects anything else: %s', (url) => {
    expect(isAllowedMapUrl(url)).toBe(false);
  });
});
