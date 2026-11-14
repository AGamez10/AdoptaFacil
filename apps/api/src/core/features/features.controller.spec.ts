import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { FeaturesController } from './features.controller';

const CLIENT_ID = '123456789012-abcdefghijklmnop.apps.googleusercontent.com';

function controllerWith(values: Record<string, unknown>) {
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  return new FeaturesController(config);
}

describe('FeaturesController · Google Client ID', () => {
  it('publishes the Client ID the API verifies tokens against when the real adapter is bound', () => {
    const body = controllerWith({
      AUTH_IDENTITY_DRIVER: 'google',
      GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID,
    }).getFeatures();
    expect(body.googleSignIn).toBe(true);
    expect(body.googleClientId).toBe(CLIENT_ID);
  });

  it('publishes no Client ID for the fake or disabled adapters', () => {
    for (const driver of ['fake', 'disabled']) {
      const body = controllerWith({
        AUTH_IDENTITY_DRIVER: driver,
        GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID,
      }).getFeatures();
      expect(body.googleClientId).toBeUndefined();
    }
  });

  it('never publishes something that is not a Google web Client ID', () => {
    const body = controllerWith({
      AUTH_IDENTITY_DRIVER: 'google',
      GOOGLE_OAUTH_CLIENT_ID: 'GOCSPX-this-looks-like-a-secret',
    }).getFeatures();
    expect(body.googleClientId).toBeUndefined();
  });
});
