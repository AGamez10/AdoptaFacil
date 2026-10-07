import { DisabledDianAdapter } from './disabled-dian.adapter';

describe('DisabledDianAdapter (R0-1, SEC-003)', () => {
  it('never reports an RTE as verified', async () => {
    const adapter = new DisabledDianAdapter();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(adapter.verifyRteStatus('900123456')).resolves.toEqual({ verified: false });
    }
  });
});
