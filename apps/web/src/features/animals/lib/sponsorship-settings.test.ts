import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../shell/api';
import {
  formatAmountInput,
  parseAmountInput,
  sponsorshipErrorMessage,
} from './sponsorship-settings';

describe('parseAmountInput', () => {
  it.each([
    ['50000', 50_000],
    ['50.000', 50_000],
    ['$ 50.000', 50_000],
    [' 1.250.000 ', 1_250_000],
    ['7', 7],
  ])('reads %j as %d pesos', (raw, expected) => {
    expect(parseAmountInput(raw)).toEqual({ ok: true, value: expected });
  });

  it.each(['', '   ', '50.000,50', '50,5', 'abc', '5.00', '-1000', '0', '20.000.000'])(
    'rejects %j with a readable message',
    (raw) => {
      const parsed = parseAmountInput(raw);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.message).toMatch(/[a-z]/);
    },
  );

  it('round-trips the suggested amount as Colombians write it', () => {
    expect(formatAmountInput(50_000)).toBe('50.000');
    expect(parseAmountInput(formatAmountInput(50_000))).toEqual({ ok: true, value: 50_000 });
  });
});

describe('sponsorshipErrorMessage', () => {
  it('never leaks the raw server message', () => {
    const msg = sponsorshipErrorMessage(
      new ApiError(500, 'x', 'PrismaClientKnownRequestError P2002'),
    );
    expect(msg).not.toMatch(/Prisma/);
    expect(msg).toMatch(/Inténtalo de nuevo/);
  });

  it('explains network, permission and conflict cases in plain words', () => {
    expect(sponsorshipErrorMessage(new TypeError('Failed to fetch'))).toMatch(/conexión/);
    expect(sponsorshipErrorMessage(new ApiError(403, 'forbidden', 'Forbidden'))).toMatch(/rol/);
    expect(sponsorshipErrorMessage(new ApiError(409, 'conflict', 'x'))).toMatch(/padrinos nuevos/);
  });
});
