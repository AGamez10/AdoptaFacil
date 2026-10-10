import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api-client';
import { InMemoryTokenStore } from './token-store';
import { DATA_CHANGED_EVENT } from './data-changed';

function client() {
  return new ApiClient({
    baseUrl: 'http://api.test',
    tokenStore: new InMemoryTokenStore(),
    refreshTokens: vi.fn(),
    fetchFn: vi.fn(async () => new Response('{}', { status: 200 })),
  });
}

describe('aviso de datos cambiados (Ola 3)', () => {
  const listener = vi.fn();
  afterEach(() => {
    window.removeEventListener(DATA_CHANGED_EVENT, listener);
    listener.mockReset();
  });

  it('se emite tras una escritura exitosa y no tras una lectura', async () => {
    window.addEventListener(DATA_CHANGED_EVENT, listener);
    const api = client();
    await api.request('/x');
    expect(listener).not.toHaveBeenCalled();
    await api.request('/x', { method: 'POST', json: {} });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
