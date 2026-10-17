import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { readFeatureFlags } from './feature-flags';

function config(values: Partial<Record<keyof Env, unknown>>): ConfigService<Env, true> {
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
}

describe('readFeatureFlags', () => {
  it('turns the community wall on only when community is on too', () => {
    expect(readFeatureFlags(config({ FEATURE_COMMUNITY_WALL: true })).communityWall).toBe(false);
    expect(
      readFeatureFlags(config({ FEATURE_COMMUNITY: true, FEATURE_COMMUNITY_WALL: true }))
        .communityWall,
    ).toBe(true);
  });

  it('lets the directory ship without the wall', () => {
    const flags = readFeatureFlags(config({ FEATURE_COMMUNITY: true }));
    expect(flags.community).toBe(true);
    expect(flags.communityWall).toBe(false);
  });
});
