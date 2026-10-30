/**
 * `pnpm mail:test <correo>` — envía un correo de prueba con los SMTP_* del
 * `.env` de la raíz (el mismo que lee la API) y dice en español si salió o,
 * si no, por qué. No usa la cola ni la base de datos: prueba solo la conexión
 * con el proveedor de correo. Nunca imprime la contraseña.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as nodemailer from 'nodemailer';

/** Mismo cargador que `seed-platform-admin.ts`: no pisa variables del shell. */
function loadRootEnv(): void {
  const envPath = join(__dirname, '..', '..', '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** Traduce los errores típicos de nodemailer a un paso concreto. */
function explain(error: { code?: string; responseCode?: number; message?: string }): string {
  if (error.code === 'EAUTH' || error.responseCode === 535) {
    return 'El servidor rechazó el usuario o la contraseña. Con Gmail usa una contraseña de aplicación (no la de tu cuenta) y verifica SMTP_USER.';
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ESOCKET') {
    return 'No se pudo conectar al servidor. Revisa SMTP_HOST y SMTP_PORT (Gmail: smtp.gmail.com y 465) y que tu red no bloquee ese puerto.';
  }
  if (error.code === 'EDNS' || error.code === 'ENOTFOUND') {
    return 'SMTP_HOST no existe o no se pudo resolver. Revisa que esté bien escrito.';
  }
  if (error.code === 'EENVELOPE') {
    return 'El servidor rechazó el remitente o el destinatario. Revisa SMTP_FROM y el correo de destino.';
  }
  return error.message ?? 'Error desconocido.';
}

async function main(): Promise<void> {
  loadRootEnv();
  const to = process.argv.slice(2).find((arg) => arg !== '--');
  if (!to || !to.includes('@')) {
    console.error('Uso: pnpm mail:test <correo-de-destino>');
    process.exit(2);
  }

  const missing = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].filter(
    (key) => !process.env[key],
  );
  if (missing.length > 0) {
    console.error(`Faltan en tu .env: ${missing.join(', ')}.`);
    console.error('Llénalas (ver .env.example) y vuelve a intentarlo.');
    process.exit(1);
  }
  if (process.env.NOTIFICATION_DRIVER !== 'smtp') {
    console.warn(
      'Aviso: NOTIFICATION_DRIVER no es "smtp". Esta prueba usa tus datos SMTP, pero la API ' +
        'seguirá sin enviar correos hasta que pongas NOTIFICATION_DRIVER=smtp y la reinicies.',
    );
  }

  const port = Number(process.env.SMTP_PORT);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER as string, pass: process.env.SMTP_PASS as string },
  });

  try {
    await transport.verify();
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: 'Prueba de correo de AdoptaFácil',
      text:
        'Si lees esto, el envío de correos de AdoptaFácil funciona con tu configuración SMTP.\n' +
        `Servidor: ${process.env.SMTP_HOST}:${port}\nEnviado: ${new Date().toISOString()}`,
    });
    console.log(`Listo: el correo de prueba salió hacia ${to}. Revisa también la carpeta de spam.`);
  } catch (error) {
    console.error(`No se pudo enviar: ${explain(error as Parameters<typeof explain>[0])}`);
    process.exit(1);
  }
}

void main();
