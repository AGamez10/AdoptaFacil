import {
  buildContractAttachmentName,
  buildContractCopyHtml,
  buildContractCopySubject,
  buildContractCopyText,
  buildContractLink,
  escapeHtml,
  type AdoptionContractCopyEmailInput,
} from './adoption-contract-email';

const input: AdoptionContractCopyEmailInput = {
  recipientName: 'Ana <script>alert(1)</script>',
  recipientRole: 'adopter',
  organizationName: 'Fundación "Huellitas" & Co',
  animalName: 'Luna\r\nBcc: victima@example.com',
  contractId: '0f9b6c1e-1111-4000-8000-000000000000',
  contentHash: 'b'.repeat(64),
  signedAt: '2026-10-08T23:30:00.000Z',
  webBaseUrl: 'https://app.adoptafacil.co/',
};

describe('correo de copia del contrato', () => {
  it('escapa HTML en todo dato variable', () => {
    const html = buildContractCopyHtml(input);
    expect(html).not.toContain('<script>');
    expect(html).toContain('Ana &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Fundación &quot;Huellitas&quot; &amp; Co');
    expect(escapeHtml(`<a href='x'>`)).toBe('&lt;a href=&#39;x&#39;&gt;');
  });

  it('el asunto es una sola línea: no se pueden inyectar cabeceras', () => {
    const subject = buildContractCopySubject(input);
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.startsWith('Copia firmada: contrato de adopción de Luna')).toBe(true);
  });

  it('el texto plano lleva enlace, huella y fecha en hora Colombia', () => {
    const text = buildContractCopyText(input);
    expect(text).toContain(
      'https://app.adoptafacil.co/adopciones/contratos/0f9b6c1e-1111-4000-8000-000000000000',
    );
    expect(text).toContain('b'.repeat(64));
    // 23:30 UTC del 8 de octubre = 18:30 del 8 de octubre en Bogotá.
    expect(text).toContain('8 de octubre de 2026');
  });

  it('el mensaje cambia según quién lo recibe', () => {
    expect(buildContractCopyText(input)).toContain('¡Felicidades!');
    expect(
      buildContractCopyText({ ...input, recipientRole: 'organization_representative' }),
    ).toContain('para el archivo de');
  });

  it('nombre de adjunto ASCII seguro y enlace codificado', () => {
    expect(buildContractAttachmentName('Ñoño el Pequeño/../', 'abcdef12-3')).toBe(
      'contrato-adopcion-nono-el-pequeno-abcdef12.pdf',
    );
    expect(buildContractAttachmentName('🐶', 'abcdef12')).toBe(
      'contrato-adopcion-animal-abcdef12.pdf',
    );
    expect(buildContractLink('https://x.co//', 'a/b')).toBe(
      'https://x.co/adopciones/contratos/a%2Fb',
    );
  });
});
