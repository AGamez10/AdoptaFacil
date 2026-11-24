import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { CloudflareCustomHostnames } from './cloudflare-custom-hostnames';

const ZONE = '0123456789abcdef0123456789abcdef';
const TOKEN = 'cf-token-de-prueba-0123456789';

function gateway(env: Partial<Record<string, string>>) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService<Env, true>;
  return new CloudflareCustomHostnames(config);
}

function reply(result: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({ success: ok, errors: ok ? [] : [{ code: 1, message: 'no' }], result }),
  } as Response;
}

describe('CloudflareCustomHostnames', () => {
  const fetchMock = jest.fn();
  const configured = () =>
    gateway({ CLOUDFLARE_SAAS_ZONE_ID: ZONE, CLOUDFLARE_SAAS_API_TOKEN: TOKEN });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('está apagado sin zona o sin token', () => {
    expect(gateway({}).enabled).toBe(false);
    expect(gateway({ CLOUDFLARE_SAAS_ZONE_ID: ZONE }).enabled).toBe(false);
    expect(configured().enabled).toBe(true);
  });

  it('registra el dominio si no existe, con certificado DV por HTTP y TLS 1.2', async () => {
    fetchMock.mockResolvedValueOnce(reply([])).mockResolvedValueOnce(
      reply({
        id: 'h1',
        hostname: 'www.refugio.org',
        status: 'pending',
        ssl: { status: 'initializing' },
      }),
    );

    await expect(configured().ensure('www.refugio.org')).resolves.toBe('pending');

    const [findUrl, findInit] = fetchMock.mock.calls[0];
    expect(findUrl).toBe(
      `https://api.cloudflare.com/client/v4/zones/${ZONE}/custom_hostnames?hostname=www.refugio.org`,
    );
    expect(findInit.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const [createUrl, createInit] = fetchMock.mock.calls[1];
    expect(createUrl).toBe(`https://api.cloudflare.com/client/v4/zones/${ZONE}/custom_hostnames`);
    expect(createInit.method).toBe('POST');
    expect(JSON.parse(createInit.body)).toEqual({
      hostname: 'www.refugio.org',
      ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
    });
  });

  it('no duplica un dominio ya registrado y lo da por activo solo con el certificado activo', async () => {
    fetchMock.mockResolvedValueOnce(
      reply([
        { id: 'h1', hostname: 'www.refugio.org', status: 'active', ssl: { status: 'active' } },
      ]),
    );
    await expect(configured().ensure('www.refugio.org')).resolves.toBe('active');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(
      reply([
        {
          id: 'h1',
          hostname: 'www.refugio.org',
          status: 'active',
          ssl: { status: 'pending_validation' },
        },
      ]),
    );
    await expect(configured().status('www.refugio.org')).resolves.toBe('pending');
  });

  it('ignora coincidencias parciales de la búsqueda', async () => {
    fetchMock.mockResolvedValueOnce(
      reply([
        { id: 'h9', hostname: 'blog.www.refugio.org', status: 'active', ssl: { status: 'active' } },
      ]),
    );
    await expect(configured().status('www.refugio.org')).resolves.toBeNull();
  });

  it('borra por id y no hace nada si no existe', async () => {
    fetchMock
      .mockResolvedValueOnce(reply([{ id: 'h1', hostname: 'www.refugio.org' }]))
      .mockResolvedValueOnce(reply({ id: 'h1' }));
    await configured().remove('www.refugio.org');
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://api.cloudflare.com/client/v4/zones/${ZONE}/custom_hostnames/h1`,
    );
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(reply([]));
    await configured().remove('www.otro.org');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lanza si Cloudflare responde con error, sin incluir el token', async () => {
    fetchMock.mockResolvedValueOnce(reply(null, false, 403));
    const error = await configured()
      .ensure('www.refugio.org')
      .catch((e: Error) => e);
    expect((error as Error).message).toMatch(/HTTP 403/);
    expect((error as Error).message).not.toContain(TOKEN);
  });
});
