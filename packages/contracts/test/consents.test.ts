import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

describe('docs/legal/autorizacion-reportes-organizacion', () => {
  it('el archivo para el abogado contiene el texto vigente, palabra por palabra', () => {
    const { version, text } = THIRD_PARTY_CONSENT_TEXTS.org_report_identification;
    const file = readFileSync(
      join(__dirname, '../../../docs/legal/autorizacion-reportes-organizacion', `${version}.md`),
      'utf8',
    );
    expect(file).toContain(text);
    expect(file).toContain('BORRADOR SUJETO A REVISIÓN DE ABOGADO');
  });
});
