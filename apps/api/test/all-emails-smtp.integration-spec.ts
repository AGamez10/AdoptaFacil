import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../src/core/notifications/notification.port';
import { EMAIL_CATALOG } from '../src/core/notifications/templates/email-catalog';
import { exampleValues } from '../src/core/notifications/templates/email-render';
import { SmtpSink } from './support/smtp-sink';

/** Decodifica una parte MIME (quoted-printable o base64) a texto UTF-8. */
function decodePart(raw: string): { type: string; body: string } {
  const split = raw.search(/\r\n\r\n/);
  const head = raw.slice(0, split);
  const body = raw.slice(split + 4);
  const type = /content-type:\s*([^;\r\n]+)/i.exec(head)?.[1]?.trim().toLowerCase() ?? '';
  const enc = /content-transfer-encoding:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim().toLowerCase();
  if (enc === 'base64')
    return { type, body: Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8') };
  if (enc === 'quoted-printable') {
    const bytes = body
      .replace(/=\r\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
    return { type, body: Buffer.from(bytes, 'latin1').toString('utf8') };
  }
  return { type, body };
}

/** Asunto RFC 2047 (=?UTF-8?Q?…?= / =?UTF-8?B?…?=) → texto. */
function decodeHeader(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?utf-8\?([QB])\?([^?]*)\?=/gi, (_m, enc: string, text: string) =>
      enc.toUpperCase() === 'B'
        ? Buffer.from(text, 'base64').toString('utf8')
        : Buffer.from(
            text
              .replace(/_/g, ' ')
              .replace(/=([0-9A-F]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16))),
            'latin1',
          ).toString('utf8'),
    );
}

function parse(data: string) {
  const headerEnd = data.indexOf('\r\n\r\n');
  const headers = data.slice(0, headerEnd).replace(/\r\n[ \t]+/g, ' ');
  const subject = decodeHeader(/^subject:\s*(.*)$/im.exec(headers)?.[1] ?? '');
  const parts = data
    .split(/\r\n--[^\r\n]+/)
    .filter((p) => /content-type:/i.test(p))
    .map((p) => decodePart(p.replace(/^\r\n/, '')));
  return {
    subject,
    html: parts.find((p) => p.type === 'text/html')?.body ?? '',
    text: parts.find((p) => p.type === 'text/plain')?.body ?? '',
  };
}

// Restos que nunca deben llegar al buzón: marcadores sin reemplazar, valores
// vacíos de JS o frases en inglés del código.
const LEAKS =
  /\{\{|\}\}|\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]|\b(Hello|Click here|Dear|Your account|Thank you)\b/;

/**
 * Cada correo del catálogo (y uno sin plantilla) por la ruta real de envío:
 * NOTIFICATION_PORT → cola BullMQ → plantilla resuelta en la base → SMTP real
 * hacia una bandeja local (como Mailpit). Revisa lo que de verdad llega.
 * Con EMAIL_DUMP_DIR guarda cada .eml y su HTML para revisarlos a mano.
 */
describe('Todos los correos llegan por SMTP con la plantilla de AdoptaFácil', () => {
  const sink = new SmtpSink();
  let app: INestApplication;
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    const port = await sink.start();
    process.env.NOTIFICATION_DRIVER = 'smtp';
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(port);
    process.env.SMTP_FROM = '"AdoptaFácil" <no-reply@adoptafacil.local>';
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await sink.stop();
    process.env = savedEnv;
  });

  it('los envía todos y cada uno llega bien', async () => {
    const port = app.get<NotificationPort>(NOTIFICATION_PORT);
    const run = Date.now().toString(36);
    const expected = new Map<string, string>();
    for (const def of EMAIL_CATALOG) {
      const to = `${def.event.replace(/[._]/g, '-')}-${run}@buzon.test`;
      expected.set(to, def.event);
      await port.send({
        to,
        subject: `respaldo ${def.event}`,
        body: `respaldo ${def.event}`,
        template: {
          event: def.event,
          organizationName: 'Fundación Huellitas de Amor',
          data: exampleValues(def.variables),
        },
      });
    }
    const plainTo = `sin-plantilla-${run}@buzon.test`;
    expected.set(plainTo, '(sin plantilla)');
    await port.send({
      to: plainTo,
      subject: 'Aviso sin plantilla',
      body: 'Hola,\n\nTexto plano de un módulo.\n\nhttps://adoptafacil.co/ayuda',
    });

    const mine = () => sink.messages.filter((m) => m.to.some((t) => expected.has(t)));
    const deadline = Date.now() + 60_000;
    while (mine().length < expected.size && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }

    const dump = process.env.EMAIL_DUMP_DIR;
    if (dump) mkdirSync(dump, { recursive: true });
    const problems: string[] = [];
    const arrived = new Set<string>();
    for (const message of mine()) {
      const to = message.to.find((t) => expected.has(t))!;
      const event = expected.get(to)!;
      arrived.add(to);
      const { subject, html, text } = parse(message.data);
      if (dump) {
        writeFileSync(join(dump, `${event}.eml`), message.data);
        writeFileSync(join(dump, `${event}.html`), html);
        writeFileSync(join(dump, `${event}.txt`), `Asunto: ${subject}\n\n${text}`);
      }
      const fail = (why: string) => problems.push(`${event}: ${why}`);
      if (!subject.trim() || subject.startsWith('respaldo')) fail(`asunto "${subject}"`);
      if (!html.includes('Adopta<span')) fail('sin la plantilla de marca');
      if (!html.includes('Ley 1581 de 2012')) fail('sin el pie legal');
      if (!text.trim()) fail('sin parte de texto plano');
      const leak = LEAKS.exec(`${subject}\n${html.replace(/<[^>]+>/g, ' ')}\n${text}`);
      if (leak) fail(`texto suelto "${leak[0]}"`);
      for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
        if (!/^https?:\/\/[^\s]+$/.test(href.replace(/&amp;/g, '&')))
          fail(`enlace inválido ${href}`);
      }
      const def = EMAIL_CATALOG.find((d) => d.event === event);
      if (def?.ctaUrlVariable && def.defaults.ctaLabel) {
        const url = String(exampleValues(def.variables)[def.ctaUrlVariable]);
        if (!html.includes(`href="${url.replace(/&/g, '&amp;')}"`))
          fail(`el botón no lleva a ${url}`);
      }
    }
    for (const [to, event] of expected) if (!arrived.has(to)) problems.push(`${event}: no llegó`);

    expect(problems).toEqual([]);
    expect(arrived.size).toBe(EMAIL_CATALOG.length + 1);
  });
});
