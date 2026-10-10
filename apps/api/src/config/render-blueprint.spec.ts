import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRODUCTION_FORBIDDEN_DRIVERS, validateEnv } from './env.validation';

/**
 * Ola 1 · R0-1: the deployment blueprint itself must describe a production the
 * API accepts. Before, render.yaml declared PAYMENT_DRIVER=fake and left
 * AUTH_IDENTITY_DRIVER to its fake default (SEC-001/SEC-002). This test reads
 * the api service's envVars from render.yaml, fills the values Render
 * provides at deploy time with placeholders, and runs the boot validation.
 */

const RENDER_YAML = join(__dirname, '..', '..', '..', '..', 'render.yaml');

/** Placeholders for `sync: false` / `generateValue` / `fromDatabase` / `fromService`. */
const PROVIDED_AT_DEPLOY: Record<string, string> = {
  DATABASE_URL: 'postgresql://owner:dummy@db.internal:5432/adoptafacil',
  DATABASE_URL_APP: 'postgresql://adoptafacil_app:dummy@db.internal:5432/adoptafacil',
  REDIS_URL: 'redis://red-dummy:6379',
  API_CORS_ORIGIN: 'https://web.example.test',
  WEB_BASE_URL: 'https://web.example.test',
  STORAGE_PUBLIC_BASE_URL: 'https://api.example.test',
  SMTP_PORT: '465',
};

/** Minimal reader for the `envVars` of one service in render.yaml (no YAML dependency). */
function readServiceEnv(yaml: string, serviceName: string): Record<string, string> {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `name: ${serviceName}`);
  if (start === -1) throw new Error(`service ${serviceName} not found in render.yaml`);
  const env: Record<string, string> = {};
  let currentKey: string | null = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^ {2}- type:/.test(line)) break; // next service
    const keyMatch = line.match(/^\s+- key:\s*(\S+)/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      continue;
    }
    if (!currentKey) continue;
    const valueMatch = line.match(/^\s+value:\s*(.+?)\s*$/);
    if (valueMatch) {
      env[currentKey] = valueMatch[1].replace(/^['"]|['"]$/g, '');
      currentKey = null;
      continue;
    }
    if (/^\s+(sync: false|generateValue: true|fromDatabase:|fromService:)/.test(line)) {
      env[currentKey] = PROVIDED_AT_DEPLOY[currentKey] ?? `placeholder-${currentKey}`;
      currentKey = null;
    }
  }
  return env;
}

describe('render.yaml production blueprint (R0-1)', () => {
  const env = readServiceEnv(readFileSync(RENDER_YAML, 'utf8'), 'adoptafacil-api');

  it('runs the api in production', () => {
    expect(env.NODE_ENV).toBe('production');
  });

  it('declares every driver explicitly and none of them is simulated', () => {
    for (const [key, forbidden] of Object.entries(PRODUCTION_FORBIDDEN_DRIVERS)) {
      expect({ key, value: env[key] }).toEqual({ key, value: expect.any(String) });
      expect(forbidden as readonly string[]).not.toContain(env[key]);
    }
  });

  it('keeps money modules and minors off', () => {
    for (const flag of [
      'FEATURE_PAYMENTS',
      'FEATURE_SPONSORSHIPS',
      'FEATURE_DONATION_CERTIFICATES',
      'FEATURE_VOLUNTEERING_MINORS',
    ]) {
      expect({ flag, value: env[flag] }).toEqual({ flag, value: 'false' });
    }
  });

  it('passes the same validation the API runs at boot', () => {
    expect(() => validateEnv(env)).not.toThrow();
  });
});
