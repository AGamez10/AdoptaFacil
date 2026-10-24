import { NotFoundException } from '@nestjs/common';
import { DisabledIdentityAdapter } from './disabled-identity.adapter';

describe('DisabledIdentityAdapter (R0-1, SEC-001)', () => {
  it('refuses every token, including the fake adapter formats', async () => {
    const adapter = new DisabledIdentityAdapter();
    for (const token of [
      'fake:admin@adoptafacil.local:x',
      'eyJlbWFpbCI6ImEifQ',
      'real-looking.jwt.token',
    ]) {
      await expect(adapter.verifyGoogleIdToken(token)).rejects.toBeInstanceOf(NotFoundException);
    }
  });
});
