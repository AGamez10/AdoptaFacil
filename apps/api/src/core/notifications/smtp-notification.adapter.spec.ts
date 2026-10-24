import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import {
  type MailTransport,
  type MailTransportFactory,
  SmtpNotificationAdapter,
} from './smtp-notification.adapter';

const ENV: Record<string, unknown> = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: 465,
  SMTP_USER: 'mailer@example.test',
  SMTP_PASS: 'app-password',
  SMTP_FROM: 'AdoptaFácil <no-reply@example.test>',
};

function makeConfig(): ConfigService<Env, true> {
  return { get: (key: string) => ENV[key] } as unknown as ConfigService<Env, true>;
}

describe('SmtpNotificationAdapter (T-109)', () => {
  it('builds the transport from env (host/port/secure/auth) — no hardcoded creds', () => {
    const createTransport = jest.fn(
      () => ({ sendMail: jest.fn().mockResolvedValue({}) }) as MailTransport,
    ) as unknown as MailTransportFactory;
    new SmtpNotificationAdapter(makeConfig(), createTransport);
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.test',
      port: 465,
      secure: true,
      auth: { user: 'mailer@example.test', pass: 'app-password' },
      pool: true,
      maxConnections: 5,
    });
  });

  it('sends via the transport with the message fields', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const createTransport = (() => ({ sendMail }) as MailTransport) as MailTransportFactory;
    const adapter = new SmtpNotificationAdapter(makeConfig(), createTransport);

    await adapter.send({ to: 'user@dest.test', subject: 'Hola', body: 'contenido' });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'AdoptaFácil <no-reply@example.test>',
      to: 'user@dest.test',
      subject: 'Hola',
      text: 'contenido',
    });
  });

  it('branded email: keeps the SMTP_FROM address, changes only the name, adds Reply-To', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const createTransport = (() => ({ sendMail }) as MailTransport) as MailTransportFactory;
    const adapter = new SmtpNotificationAdapter(makeConfig(), createTransport);

    await adapter.send({
      to: 'user@dest.test',
      subject: 'Hola',
      body: 'contenido',
      fromName: 'Huellitas vía AdoptaFácil',
      replyTo: 'contacto@huellitas.org',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: { name: 'Huellitas vía AdoptaFácil', address: 'no-reply@example.test' },
      replyTo: 'contacto@huellitas.org',
      to: 'user@dest.test',
      subject: 'Hola',
      text: 'contenido',
    });
  });

  it('adds html, headers and attachments only when present (additive)', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const createTransport = (() => ({ sendMail }) as MailTransport) as MailTransportFactory;
    const adapter = new SmtpNotificationAdapter(makeConfig(), createTransport);
    const attachments = [
      { filename: 'a.pdf', content: Buffer.from('x'), contentType: 'application/pdf' },
    ];

    await adapter.send({
      to: 'user@dest.test',
      subject: 'Hola',
      body: 'texto',
      html: '<p>hola</p>',
      headers: { 'List-Unsubscribe': '<https://x/u>' },
      attachments,
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'AdoptaFácil <no-reply@example.test>',
      to: 'user@dest.test',
      subject: 'Hola',
      text: 'texto',
      html: '<p>hola</p>',
      headers: { 'List-Unsubscribe': '<https://x/u>' },
      attachments,
    });
  });

  it('rethrows a send failure so the delivery queue can retry it', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP connection refused'));
    const createTransport = (() => ({ sendMail }) as MailTransport) as MailTransportFactory;
    const adapter = new SmtpNotificationAdapter(makeConfig(), createTransport);

    await expect(
      adapter.send({ to: 'user@dest.test', subject: 'Hola', body: 'x' }),
    ).rejects.toThrow('SMTP connection refused');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
