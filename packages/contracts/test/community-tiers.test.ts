import { describe, expect, it } from 'vitest';
import { COMMUNITY_TIERS, communityTier } from '../src/community';

describe('communityTier', () => {
  it('starts everyone as "Huella nueva", including invalid points', () => {
    expect(communityTier(0).key).toBe('newcomer');
    expect(communityTier(-4).key).toBe('newcomer');
    expect(communityTier(Number.NaN).key).toBe('newcomer');
  });

  it('climbs at each threshold', () => {
    expect(communityTier(24).key).toBe('newcomer');
    expect(communityTier(25).key).toBe('friend');
    expect(communityTier(99).key).toBe('friend');
    expect(communityTier(100).key).toBe('guardian');
    expect(communityTier(300).key).toBe('legend');
    expect(communityTier(10_000).key).toBe('legend');
  });

  it('keeps tiers sorted from lowest to highest', () => {
    const mins = COMMUNITY_TIERS.map((t) => t.minPoints);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });
});
