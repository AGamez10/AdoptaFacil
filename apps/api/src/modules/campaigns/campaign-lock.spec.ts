import { campaignChanges, campaignLockProblem, type LockedCampaignState } from './campaign-lock';

const base: LockedCampaignState = {
  title: 'Vacunas',
  description: 'Para 100 perros',
  category: 'medications',
  goalAmount: 500_000,
  deadline: new Date('2026-12-31T00:00:00.000Z'),
  status: 'active',
  raisedAmount: 0,
};

const sameForm = {
  title: 'Vacunas',
  description: 'Para 100 perros',
  category: 'medications',
  goalAmount: 500_000,
  deadline: '2026-12-31T00:00:00.000Z',
  status: 'active',
} as const;

describe('campaign lock (B3: closed campaigns are final; goal never goes down after money)', () => {
  it('resending the same values is not a change', () => {
    expect(campaignChanges(base, sameForm as never)).toEqual({});
    expect(campaignLockProblem({ ...base, status: 'closed' }, {})).toBeNull();
  });

  it('a closed campaign cannot be reopened', () => {
    const closed = { ...base, status: 'closed' };
    const changes = campaignChanges(closed, { status: 'active' } as never);
    expect(changes.status).toEqual({ from: 'closed', to: 'active' });
    expect(campaignLockProblem(closed, changes)).toMatch(/no se puede reabrir/);
  });

  it('a cancelled campaign cannot change its goal or deadline', () => {
    const cancelled = { ...base, status: 'cancelled' };
    for (const input of [{ goalAmount: 900_000 }, { deadline: '2027-01-31T00:00:00.000Z' }]) {
      const changes = campaignChanges(cancelled, input as never);
      expect(campaignLockProblem(cancelled, changes)).toMatch(/cancelada/);
    }
  });

  it('with money raised the goal cannot go down nor the category change', () => {
    const funded = { ...base, raisedAmount: 120_000 };
    expect(
      campaignLockProblem(funded, campaignChanges(funded, { goalAmount: 400_000 } as never)),
    ).toMatch(/meta no se puede bajar/);
    expect(
      campaignLockProblem(funded, campaignChanges(funded, { category: 'food' } as never)),
    ).toMatch(/categoría/);
  });

  it('with money raised the goal can go up, the deadline move and the campaign close', () => {
    const funded = { ...base, raisedAmount: 120_000 };
    for (const input of [
      { goalAmount: 800_000 },
      { deadline: '2027-01-31T00:00:00.000Z' },
      { status: 'closed' },
      { title: 'Vacunas de invierno' },
    ]) {
      expect(campaignLockProblem(funded, campaignChanges(funded, input as never))).toBeNull();
    }
  });

  it('without money the goal can go down', () => {
    expect(
      campaignLockProblem(base, campaignChanges(base, { goalAmount: 100 } as never)),
    ).toBeNull();
  });

  it('the audit gets before/after values but never the description text', () => {
    const changes = campaignChanges(base, {
      description: 'nuevo texto',
      goalAmount: 600_000,
    } as never);
    expect(changes.description).toEqual({ from: null, to: null });
    expect(changes.goalAmount).toEqual({ from: 500_000, to: 600_000 });
  });
});
