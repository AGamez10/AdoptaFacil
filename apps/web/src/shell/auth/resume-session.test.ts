import { describe, expect, it, vi } from 'vitest';
import { createShellApi } from '../api';
import { resumeSessionOnce } from './resume-session';

const TOKENS = {
  accessToken: 'access',
  refreshToken: 'refresh',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
};

describe('resumeSessionOnce', () => {
  it('shares one refresh/silent + me round trip between concurrent callers (StrictMode)', async () => {
    const api = createShellApi();
    const refreshSilent = vi.fn().mockResolvedValue(TOKENS);
    const me = vi.fn().mockResolvedValue({ id: 'usr_1' });
    api.authApi.refreshSilent = refreshSilent;
    api.authApi.me = me;

    const [first, second] = await Promise.all([resumeSessionOnce(api), resumeSessionOnce(api)]);

    expect(refreshSilent).toHaveBeenCalledTimes(1);
    expect(me).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first?.user).toEqual({ id: 'usr_1' });
  });

  it('starts a fresh attempt once the previous one settled', async () => {
    const api = createShellApi();
    const refreshSilent = vi.fn().mockResolvedValue(null);
    api.authApi.refreshSilent = refreshSilent;

    expect(await resumeSessionOnce(api)).toBeNull();
    expect(await resumeSessionOnce(api)).toBeNull();
    expect(refreshSilent).toHaveBeenCalledTimes(2);
  });
});
