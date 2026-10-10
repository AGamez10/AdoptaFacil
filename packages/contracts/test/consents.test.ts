import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { THIRD_PARTY_CONSENT_TEXTS } from '../src/consents';

describe('THIRD_PARTY_CONSENT_TEXTS', () => {
  it.each(Object.values(THIRD_PARTY_CONSENT_TEXTS))(
    'la huella registrada coincide con el texto de $purpose (publicar una versión nueva si cambia)',
    (doc) => {
      expect(createHash('sha256').update(doc.text, 'utf8').digest('hex')).toBe(doc.sha256);
      expect(doc.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
  );
});
