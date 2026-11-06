import { describe, expect, it } from 'vitest';
import { safeExternalUrl } from './safe-url';

describe('safeExternalUrl', () => {
  it('keeps real http(s) links', () => {
    expect(safeExternalUrl('https://instagram.com/patitas')).toBe('https://instagram.com/patitas');
    expect(safeExternalUrl(' http://patitas.org ')).toBe('http://patitas.org');
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.example',
    '/relative',
    'https://',
    '',
    null,
    undefined,
  ])('rejects %s', (raw) => {
    expect(safeExternalUrl(raw as string | null | undefined)).toBeUndefined();
  });
});
