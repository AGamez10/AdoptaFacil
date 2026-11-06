import {
  assertSafeRelativeKey,
  buildStorageKey,
  contentTypeFromKey,
  parseStorageKey,
  resolveServeUrl,
  safeName,
} from './storage-keys';

const ORG = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';

describe('storage-keys (T-108)', () => {
  describe('safeName', () => {
    it('strips directories, lowercases and replaces unsafe chars', () => {
      expect(safeName('C:\\path\\Mi Foto (1).JPG')).toBe('mi-foto-1-.jpg');
      expect(safeName('../../etc/passwd')).toBe('passwd');
      expect(safeName('')).toBe('file');
    });
  });

  describe('buildStorageKey', () => {
    it('produces <visibility>/<org>/<uuid>-<name> and is unguessable per call', () => {
      const a = buildStorageKey('private', ORG, 'doc.pdf');
      const b = buildStorageKey('private', ORG, 'doc.pdf');
      expect(a.startsWith(`private/${ORG}/`)).toBe(true);
      expect(a.endsWith('-doc.pdf')).toBe(true);
      expect(a).not.toBe(b); // uuid differs
    });
  });

  describe('assertSafeRelativeKey', () => {
    it('rejects traversal / absolute / drive / backslash / NUL', () => {
      for (const bad of ['../x', 'a/../b', '/abs/x', 'C:/x', 'a\\b', 'a\0b', '']) {
        expect(() => assertSafeRelativeKey(bad)).toThrow();
      }
      expect(() => assertSafeRelativeKey(`public/${ORG}/uuid-x.jpg`)).not.toThrow();
    });
  });

  describe('parseStorageKey', () => {
    it('parses a valid key', () => {
      expect(parseStorageKey(`public/${ORG}/abc-firu.jpg`)).toEqual({
        visibility: 'public',
        organizationId: ORG,
      });
    });
    it('returns null for bad visibility, bad org, traversal or too few segments', () => {
      expect(parseStorageKey(`secret/${ORG}/x.jpg`)).toBeNull();
      expect(parseStorageKey('public/not-a-uuid/x.jpg')).toBeNull();
      expect(parseStorageKey(`public/${ORG}`)).toBeNull();
      expect(parseStorageKey(`public/${ORG}/`)).toBeNull();
      expect(parseStorageKey(`../public/${ORG}/x`)).toBeNull();
    });
  });

  describe('contentTypeFromKey', () => {
    it('maps known extensions and falls back to octet-stream', () => {
      expect(contentTypeFromKey('a/b/c-x.jpg')).toBe('image/jpeg');
      expect(contentTypeFromKey('a/b/c-x.pdf')).toBe('application/pdf');
      expect(contentTypeFromKey('a/b/c-x.bin')).toBe('application/octet-stream');
    });
  });

  describe('resolveServeUrl (plan de escala, B2)', () => {
    const api = 'https://adoptafacil.org/api';
    const cdn = 'https://img.adoptafacil.org/api';

    it('sends public keys to the CDN host when one is configured', () => {
      expect(resolveServeUrl(api, cdn, `public/${ORG}/a-x.jpg`)).toBe(
        `${cdn}/storage/public?key=${encodeURIComponent(`public/${ORG}/a-x.jpg`)}`,
      );
    });

    it('never sends private keys to the CDN', () => {
      expect(resolveServeUrl(api, cdn, `private/${ORG}/a-x.pdf`)).toMatch(
        /^https:\/\/adoptafacil\.org\/api\/storage\/private\?key=/,
      );
    });

    it('keeps the API host when there is no CDN', () => {
      expect(resolveServeUrl(api, undefined, `public/${ORG}/a-x.jpg`)).toMatch(
        /^https:\/\/adoptafacil\.org\/api\/storage\/public\?key=/,
      );
    });
  });
});
