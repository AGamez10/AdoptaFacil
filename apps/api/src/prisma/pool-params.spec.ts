import { withPoolParams } from './prisma.service';

const URL_APP = 'postgresql://adoptafacil_app:secreto@db:5432/adoptafacil?schema=public';

describe('withPoolParams (plan de escala, B4)', () => {
  it('adds the explicit pool size, wait timeout and the PgBouncer switch', () => {
    const url = new URL(
      withPoolParams(URL_APP, {
        DATABASE_POOL_SIZE: '20',
        DATABASE_POOL_TIMEOUT_S: '5',
        DATABASE_PGBOUNCER: 'true',
      }),
    );
    expect(url.searchParams.get('connection_limit')).toBe('20');
    expect(url.searchParams.get('pool_timeout')).toBe('5');
    expect(url.searchParams.get('pgbouncer')).toBe('true');
    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.password).toBe('secreto');
  });

  it('keeps the Prisma default pool size when none is configured', () => {
    const url = new URL(withPoolParams(URL_APP, {}));
    expect(url.searchParams.has('connection_limit')).toBe(false);
    expect(url.searchParams.get('pool_timeout')).toBe('10');
    expect(url.searchParams.has('pgbouncer')).toBe(false);
  });

  it('never overrides a value the operator already put in the URL', () => {
    const url = new URL(
      withPoolParams(`${URL_APP}&connection_limit=3`, { DATABASE_POOL_SIZE: '20' }),
    );
    expect(url.searchParams.get('connection_limit')).toBe('3');
  });
});
