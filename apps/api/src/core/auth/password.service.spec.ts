import { PasswordService } from './password.service';

// bcryptjs is pure JS: at the production cost (12) each hash/compare takes
// hundreds of ms, and in CI turbo runs these jest workers next to vitest on a
// 2-vCPU runner, so a single test (2 bcrypt ops) can exceed jest's default 5 s
// (BLD-002). The cost stays the real one; only the budget is made explicit.
jest.setTimeout(30_000);

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produces a hash that differs from the plaintext and verifies it', async () => {
    const hash = await service.hash('s3cret-password!');
    expect(hash).not.toContain('s3cret-password!');
    expect(await service.verify('s3cret-password!', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('right-password');
    expect(await service.verify('wrong-password', hash)).toBe(false);
  });

  it('produces different hashes for the same password (per-hash salt)', async () => {
    const a = await service.hash('same-password');
    const b = await service.hash('same-password');
    expect(a).not.toBe(b);
  });
});
