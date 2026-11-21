import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getLegalDocument,
  LEGAL_CONSENT_GROUPS,
  LEGAL_DOCUMENTS,
  legalAudienceFor,
  requiredGuestLegalDocuments,
  requiredLegalDocuments,
} from '../src/legal';
import {
  describeLegalController,
  LEGAL_CONTROLLER,
  PLATFORM_DOCUMENT_NOTICE,
  renderLegalTemplate,
} from '../src/legal-controller';

const DOCS_DIR = join(__dirname, '..', '..', '..', 'docs', 'legal');

describe('documentos legales publicados', () => {
  it.each(LEGAL_DOCUMENTS.map((d) => [d.key, d] as const))(
    '%s: el texto publicado coincide con el hash registrado (no se editó una versión ya publicada)',
    (_key, doc) => {
      const file = join(DOCS_DIR, doc.slug, `${doc.version}.md`);
      expect(existsSync(file)).toBe(true);
      const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
      // Si esto falla, NO actualices el hash: crea docs/legal/<slug>/<nueva-versión>.md,
      // apunta aquí la nueva versión y su hash, y los usuarios la re-aceptarán.
      expect(sha256).toBe(doc.sha256);
    },
  );

  it('cada borrador lleva visible la marca de revisión de abogado', () => {
    for (const doc of LEGAL_DOCUMENTS.filter((d) => d.draft)) {
      const text = readFileSync(join(DOCS_DIR, doc.slug, `${doc.version}.md`), 'utf8');
      expect(text).toContain('BORRADOR SUJETO A REVISIÓN DE ABOGADO');
    }
  });

  it('claves y slugs son únicos', () => {
    expect(new Set(LEGAL_DOCUMENTS.map((d) => d.key)).size).toBe(LEGAL_DOCUMENTS.length);
    expect(new Set(LEGAL_DOCUMENTS.map((d) => d.slug)).size).toBe(LEGAL_DOCUMENTS.length);
  });
});

describe('qué debe aceptar cada quien', () => {
  it('una persona acepta términos, alcance, política y autorización de datos', () => {
    expect(requiredLegalDocuments('person').sort()).toEqual(
      ['data_authorization', 'platform_scope', 'privacy_policy', 'terms'].sort(),
    );
  });

  it('una organización además acepta sus condiciones y el acuerdo de datos', () => {
    expect(requiredLegalDocuments('organization')).toContain('org_terms');
  });

  it('el donante invitado acepta lo mismo que una persona', () => {
    expect(requiredGuestLegalDocuments().sort()).toEqual(requiredLegalDocuments('person').sort());
  });

  it('la autorización comercial nunca es obligatoria', () => {
    expect(getLegalDocument('commercial_authorization').acceptance).toBe('optional');
    expect(requiredLegalDocuments('organization')).not.toContain('commercial_authorization');
    expect(getLegalDocument('ai_training_authorization').acceptance).toBe('optional');
    expect(requiredLegalDocuments('organization')).not.toContain('ai_training_authorization');
    expect(requiredGuestLegalDocuments()).not.toContain('ai_training_authorization');
  });

  it('la autorización de datos va en una casilla distinta de los términos', () => {
    const groupOf = (key: string) =>
      LEGAL_CONSENT_GROUPS.find((g) => g.documents.includes(key as never))?.id;
    expect(groupOf('terms')).not.toBe(groupOf('data_authorization'));
  });

  it('las casillas obligatorias cubren exactamente los documentos obligatorios de cada papel', () => {
    const required = (audience: 'person' | 'organization' | 'member') =>
      LEGAL_CONSENT_GROUPS.filter(
        (g) =>
          !g.optional &&
          (!g.organizationOnly || audience === 'organization') &&
          (!g.memberOnly || audience === 'member'),
      )
        .flatMap((g) => g.documents)
        .sort();
    expect(required('organization')).toEqual(requiredLegalDocuments('organization').sort());
    expect(required('member')).toEqual(requiredLegalDocuments('member').sort());
    expect(required('person')).toEqual(requiredLegalDocuments('person').sort());
  });
});

describe('miembros invitados a un equipo', () => {
  it('un miembro invitado NO acepta el contrato de la organización ni declara que la obliga', () => {
    expect(requiredLegalDocuments('member')).not.toContain('org_terms');
    expect(requiredLegalDocuments('member')).toContain('member_terms');
    expect(requiredLegalDocuments('member')).toEqual(
      expect.arrayContaining(requiredLegalDocuments('person')),
    );
  });

  it('quien registra o es propietario de la organización no acepta las condiciones de miembro', () => {
    expect(requiredLegalDocuments('organization')).not.toContain('member_terms');
    expect(requiredLegalDocuments('person')).not.toContain('member_terms');
  });

  it('el papel legal sale del rol: solo el propietario habla por la organización', () => {
    expect(legalAudienceFor('organization', ['owner'])).toBe('organization');
    expect(legalAudienceFor('organization', ['administrator', 'owner'])).toBe('organization');
    for (const role of [
      'administrator',
      'operator',
      'veterinarian',
      'volunteer',
      'temporary_collaborator',
      'read_only_auditor',
      'platform_admin',
      'platform_super_admin',
    ]) {
      expect(legalAudienceFor('organization', [role])).toBe('member');
    }
    expect(legalAudienceFor('organization', [])).toBe('member');
    expect(legalAudienceFor('person', [])).toBe('person');
  });

  it('el texto de miembro dice que no obliga a la organización', () => {
    const doc = getLegalDocument('member_terms');
    const text = readFileSync(join(DOCS_DIR, doc.slug, `${doc.version}.md`), 'utf8');
    expect(text).toContain('no acepta ese contrato en nombre de la Organización');
  });
});

describe('titular configurable', () => {
  it('los textos vigentes toman los datos del titular de una sola fuente', () => {
    for (const doc of LEGAL_DOCUMENTS) {
      const raw = readFileSync(join(DOCS_DIR, doc.slug, `${doc.version}.md`), 'utf8');
      expect(raw).not.toContain('RAZÓN SOCIAL');
      const rendered = renderLegalTemplate(raw);
      expect(rendered).not.toMatch(/\{\{\s*titular/);
    }
  });

  it('sustituye los marcadores con el titular dado', () => {
    const company = {
      ...LEGAL_CONTROLLER,
      kind: 'company' as const,
      name: 'AdoptaFácil S.A.S.',
      nit: '900.000.000-1',
    };
    expect(renderLegalTemplate('De {{titular.nombre}}. {{titular}}.', company)).toBe(
      `De AdoptaFácil S.A.S.. ${describeLegalController(company)}.`,
    );
    expect(describeLegalController(company)).toContain('NIT 900.000.000-1');
    expect(renderLegalTemplate('{{otro}}')).toBe('{{otro}}');
  });

  it('el aviso de documentos generados aclara contador, revisor fiscal y certificado tributario', () => {
    expect(PLATFORM_DOCUMENT_NOTICE).toContain('contador público');
    expect(PLATFORM_DOCUMENT_NOTICE).toContain('revisor fiscal');
    expect(PLATFORM_DOCUMENT_NOTICE).toContain('la organización donataria');
  });
});
