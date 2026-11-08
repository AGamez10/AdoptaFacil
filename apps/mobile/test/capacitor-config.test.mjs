// Verifica la configuración que el CLI de Capacitor realmente evalúa.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cap = join(root, 'node_modules', '.bin', 'cap');

function resolved(serverUrl) {
  const env = { ...process.env };
  delete env.CAP_SERVER_URL;
  if (serverUrl !== undefined) env.CAP_SERVER_URL = serverUrl;
  const out = execFileSync(cap, ['config', '--json'], { cwd: root, env, encoding: 'utf8' });
  return JSON.parse(out).app.extConfig;
}

test('envuelve la web publicada por https, sin http en claro', () => {
  const config = resolved('https://app.example.org/');
  assert.equal(config.appName, 'AdoptaFácil');
  assert.equal(config.webDir, '../web/dist');
  assert.equal(config.server.url, 'https://app.example.org');
  assert.equal(config.server.cleartext, false);
  assert.equal(config.server.errorPath, 'offline.html');
  assert.equal(config.android.allowMixedContent, false);
});

test('permite http solo cuando la URL es http (emulador contra pnpm dev)', () => {
  assert.equal(resolved('http://10.0.2.2:5173').server.cleartext, true);
});

test('sin CAP_SERVER_URL empaqueta el build web local', () => {
  const config = resolved(undefined);
  assert.equal(config.server.url, undefined);
  assert.equal(config.server.androidScheme, 'https');
});

test('rechaza una CAP_SERVER_URL que no es URL', () => {
  assert.throws(() => resolved('app.example.org'));
});
