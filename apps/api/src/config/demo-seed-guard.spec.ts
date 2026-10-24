import {
  DEMO_SEED_FLAG,
  DemoSeedRefusedError,
  assertDemoSeedAllowed,
  demoSeedRefusal,
  isLocalDatabaseUrl,
} from './demo-seed-guard';

/** `seed:trafico` only ever runs against a developer's own database. */

const LOCAL = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5433/adoptafacil?schema=public',
  DATABASE_URL_APP: 'postgresql://a:a@localhost:5433/adoptafacil?schema=public',
};
const ARGV = ['node', 'seed-trafico.ts', DEMO_SEED_FLAG];

describe('demoSeedRefusal', () => {
  it('allows a local development database with the explicit flag', () => {
    expect(demoSeedRefusal(LOCAL, ARGV)).toBeNull();
    expect(() => assertDemoSeedAllowed(LOCAL, ARGV)).not.toThrow();
  });

  it.each(['production', 'PRODUCTION', ' production '])(
    'refuses with NODE_ENV=%j even with a local DB and the flag',
    (nodeEnv) => {
      expect(demoSeedRefusal({ ...LOCAL, NODE_ENV: nodeEnv }, ARGV)).toMatch(/producción/);
      expect(() => assertDemoSeedAllowed({ ...LOCAL, NODE_ENV: nodeEnv }, ARGV)).toThrow(
        DemoSeedRefusedError,
      );
    },
  );

  it.each(['true', '1', 'yes'])('refuses inside CI (CI=%j)', (ci) => {
    expect(demoSeedRefusal({ ...LOCAL, CI: ci }, ARGV)).toMatch(/CI/);
  });

  it('does not treat CI=false as CI', () => {
    expect(demoSeedRefusal({ ...LOCAL, CI: 'false' }, ARGV)).toBeNull();
  });

  it.each([
    ['a managed host', 'postgresql://u:p@db.render.com:5432/prod'],
    ['a compose service name', 'postgresql://u:p@postgres:5432/adoptafacil'],
    ['a private IP', 'postgresql://u:p@10.0.0.5:5432/adoptafacil'],
    ['a look-alike host', 'postgresql://u:p@localhost.attacker.example:5432/db'],
    ['a remote ?host= override', 'postgresql://u:p@localhost:5432/db?host=db.example.com'],
    ['a non-Postgres URL', 'mysql://u:p@localhost:3306/db'],
    ['garbage', 'not a url'],
  ])('refuses when DATABASE_URL points at %s', (_label, url) => {
    expect(demoSeedRefusal({ ...LOCAL, DATABASE_URL: url }, ARGV)).toMatch(/DATABASE_URL /);
  });

  it('refuses when DATABASE_URL_APP is remote even if DATABASE_URL is local', () => {
    const env = { ...LOCAL, DATABASE_URL_APP: 'postgresql://a:a@prod-db.example.com:5432/db' };
    expect(demoSeedRefusal(env, ARGV)).toMatch(/DATABASE_URL_APP/);
  });

  it('refuses when a database URL is missing', () => {
    expect(demoSeedRefusal({ NODE_ENV: 'development' }, ARGV)).toMatch(/DATABASE_URL/);
    expect(demoSeedRefusal({ ...LOCAL, DATABASE_URL_APP: '' }, ARGV)).toMatch(/DATABASE_URL_APP/);
  });

  it('refuses without the explicit flag', () => {
    expect(demoSeedRefusal(LOCAL, ['node', 'seed-trafico.ts'])).toMatch(/--yes-demo/);
    expect(demoSeedRefusal(LOCAL, ['node', 'seed-trafico.ts', '--yes'])).toMatch(/--yes-demo/);
  });

  it('checks production before anything else, so the message is unambiguous', () => {
    expect(demoSeedRefusal({ NODE_ENV: 'production' }, [])).toMatch(/producción/);
  });
});

describe('isLocalDatabaseUrl', () => {
  it.each([
    'postgresql://u:p@localhost:5433/db',
    'postgres://u:p@127.0.0.1/db',
    'postgresql://u:p@[::1]:5432/db',
    'postgresql://u@localhost/db?host=/var/run/postgresql',
  ])('accepts %s', (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it.each([undefined, '', '   '])('rejects an empty value (%j)', (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });
});
