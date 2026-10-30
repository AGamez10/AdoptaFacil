import { appRole, runsQueueWorkers } from './app-role';

describe('APP_ROLE (plan de escala, B7)', () => {
  it('defaults to doing everything, as before', () => {
    expect(appRole({})).toBe('all');
    expect(appRole({ APP_ROLE: 'otra-cosa' })).toBe('all');
    expect(runsQueueWorkers('all')).toBe(true);
  });

  it('keeps queue workers out of the HTTP-only role', () => {
    expect(appRole({ APP_ROLE: 'api' })).toBe('api');
    expect(runsQueueWorkers('api')).toBe(false);
    expect(runsQueueWorkers('worker')).toBe(true);
  });
});
