import { InternalSignatureAdapter } from './internal-signature.adapter';

describe('InternalSignatureAdapter (firma electrónica simple)', () => {
  const request = {
    contractId: '11111111-1111-1111-1111-111111111111',
    signerId: 'signer-1',
    signerRole: 'adopter' as const,
    documentHash: 'a'.repeat(64),
  };

  it('firma sin proveedor externo y nunca se presenta como simulada', async () => {
    const result = await new InternalSignatureAdapter().sign(request);
    expect(result.signatureId).toMatch(/^afs1:[0-9a-f]{64}$/);
    expect(result.signatureId).not.toContain('fake');
    expect(result.provider).toBe('adoptafacil-firma-electronica-simple');
    expect(Number.isNaN(Date.parse(result.signedAt))).toBe(false);
  });

  it('cada firma tiene un identificador único, aun para el mismo documento', async () => {
    const adapter = new InternalSignatureAdapter();
    const [a, b] = await Promise.all([adapter.sign(request), adapter.sign(request)]);
    expect(a.signatureId).not.toBe(b.signatureId);
  });
});
