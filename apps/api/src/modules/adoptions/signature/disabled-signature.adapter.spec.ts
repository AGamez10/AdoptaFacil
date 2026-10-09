import { ServiceUnavailableException } from '@nestjs/common';
import { DisabledSignatureAdapter } from './disabled-signature.adapter';

describe('DisabledSignatureAdapter (R0-1)', () => {
  it('refuses to produce a signature', async () => {
    await expect(
      new DisabledSignatureAdapter().sign({
        contractId: 'c',
        signerId: 's',
        signerRole: 'adopter',
        documentHash: 'h',
      } as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
