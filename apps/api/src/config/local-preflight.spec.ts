import { createServer, type Server } from 'node:net';
import { describeMissingServices, postgresAnswers, redisAnswers } from './local-preflight';

/** A local TCP server that answers (or drops) like the real service would. */
function serve(
  onData: (socket: import('node:net').Socket) => void,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((socket) => socket.once('data', () => onData(socket)));
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

describe('local preflight', () => {
  const servers: Server[] = [];
  afterEach(() => servers.splice(0).forEach((server) => server.close()));

  it('accepts a Redis that answers PONG and a Postgres that answers the SSL request', async () => {
    const redis = await serve((socket) => socket.end('+PONG\r\n'));
    const postgres = await serve((socket) => socket.end('N'));
    servers.push(redis.server, postgres.server);
    await expect(redisAnswers('127.0.0.1', redis.port)).resolves.toBe(true);
    await expect(postgresAnswers('127.0.0.1', postgres.port)).resolves.toBe(true);
  });

  it('rejects a port that accepts and then drops the connection (Docker Desktop with the container down)', async () => {
    const proxy = await serve((socket) => socket.destroy());
    servers.push(proxy.server);
    await expect(redisAnswers('127.0.0.1', proxy.port)).resolves.toBe(false);
    await expect(postgresAnswers('127.0.0.1', proxy.port)).resolves.toBe(false);
  });

  it('rejects a closed port', async () => {
    const closed = await serve(() => undefined);
    const { port } = closed;
    await new Promise((resolve) => closed.server.close(resolve));
    await expect(redisAnswers('127.0.0.1', port)).resolves.toBe(false);
  });

  it('names the missing service and the exact steps in Spanish', () => {
    const text = describeMissingServices(['Postgres (localhost:5433)']);
    expect(text).toContain('no responde Postgres (localhost:5433)');
    expect(text).toContain('docker compose up -d');
    expect(text).toContain('pnpm doctor');
  });

  it('when only "localhost" fails, says the containers are up and to use 127.0.0.1', () => {
    const text = describeMissingServices([], 'La API no puede arrancar', ['Redis']);
    expect(text).toContain('Redis responde en 127.0.0.1 pero no en "localhost"');
    expect(text).toContain('DATABASE_URL, DATABASE_URL_APP y REDIS_URL');
    expect(text).not.toContain('docker compose up -d');
  });
});
