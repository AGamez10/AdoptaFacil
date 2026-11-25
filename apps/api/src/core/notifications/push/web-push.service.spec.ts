import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.validation';
import webpush from 'web-push';
import { WebPushService } from './web-push.service';

jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}));

const sendNotification = webpush.sendNotification as unknown as jest.Mock;

function config(values: Record<string, string | undefined>): ConfigService<Env, true> {
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
}

function prismaStub(rows: unknown[] = []) {
  const queryRaw = jest.fn().mockResolvedValueOnce(rows).mockResolvedValue([]);
  return { prisma: { $queryRaw: queryRaw } as never, queryRaw };
}

const KEY_PUBLIC = 'BPublicKeyForTestsOnlyAAAAAAAAAAAAAAAAAAAAAA';
const KEY_PRIVATE = 'PrivateKeyForTestsOnlyAAAAAAAAAAAAAAAA';

beforeEach(() => {
  sendNotification.mockReset();
  (webpush.setVapidDetails as unknown as jest.Mock).mockReset();
});

describe('WebPushService', () => {
  it('queda apagado sin claves VAPID: no envía ni expone clave', async () => {
    const { prisma, queryRaw } = prismaStub();
    const service = new WebPushService(prisma, config({ VAPID_SUBJECT: 'mailto:a@b.co' }));
    expect(service.publicKeyOrNull()).toBeNull();
    await service.sendToUser('user-1', { title: 'Hola' });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('con claves VAPID expone la pública y configura web-push', () => {
    const { prisma } = prismaStub();
    const service = new WebPushService(
      prisma,
      config({
        VAPID_PUBLIC_KEY: KEY_PUBLIC,
        VAPID_PRIVATE_KEY: KEY_PRIVATE,
        VAPID_SUBJECT: 'mailto:a@b.co',
      }),
    );
    expect(service.publicKeyOrNull()).toBe(KEY_PUBLIC);
    expect(webpush.setVapidDetails).toHaveBeenCalledWith('mailto:a@b.co', KEY_PUBLIC, KEY_PRIVATE);
  });

  it('envía el aviso a cada dispositivo de la persona', async () => {
    const rows = [
      { endpoint: 'https://fcm.googleapis.com/fcm/send/1', p256dh: 'p1', auth: 'a1' },
      { endpoint: 'https://fcm.googleapis.com/fcm/send/2', p256dh: 'p2', auth: 'a2' },
    ];
    const { prisma } = prismaStub(rows);
    sendNotification.mockResolvedValue({});
    const service = new WebPushService(
      prisma,
      config({ VAPID_PUBLIC_KEY: KEY_PUBLIC, VAPID_PRIVATE_KEY: KEY_PRIVATE }),
    );
    await service.sendToUser('user-1', {
      title: 'Nueva oferta',
      body: 'Revisa',
      href: '/mis-ofertas',
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [subscription, message] = sendNotification.mock.calls[0];
    expect(subscription).toEqual({
      endpoint: rows[0].endpoint,
      keys: { p256dh: 'p1', auth: 'a1' },
    });
    expect(JSON.parse(message)).toEqual({
      title: 'Nueva oferta',
      body: 'Revisa',
      href: '/mis-ofertas',
      tag: undefined,
    });
  });

  it('quita del servicio la suscripción que responde 410 (ya no existe)', async () => {
    const rows = [{ endpoint: 'https://fcm.googleapis.com/fcm/send/gone', p256dh: 'p', auth: 'a' }];
    const { prisma, queryRaw } = prismaStub(rows);
    sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    const service = new WebPushService(
      prisma,
      config({ VAPID_PUBLIC_KEY: KEY_PUBLIC, VAPID_PRIVATE_KEY: KEY_PRIVATE }),
    );
    await service.sendToUser('user-1', { title: 'x' });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('un href externo se cambia por la raíz (nunca un enlace fuera de la app)', async () => {
    const rows = [{ endpoint: 'https://fcm.googleapis.com/fcm/send/3', p256dh: 'p', auth: 'a' }];
    const { prisma } = prismaStub(rows);
    sendNotification.mockResolvedValue({});
    const service = new WebPushService(
      prisma,
      config({ VAPID_PUBLIC_KEY: KEY_PUBLIC, VAPID_PRIVATE_KEY: KEY_PRIVATE }),
    );
    await service.sendToUser('user-1', { title: 'x', href: 'https://evil.example' });
    expect(JSON.parse(sendNotification.mock.calls[0][1]).href).toBe('/');
  });

  it('AF-N04: no guarda una suscripción que apunta fuera de los servicios de push', async () => {
    const withOrgContext = jest.fn();
    const service = new WebPushService(
      { withOrgContext } as never,
      config({ VAPID_PUBLIC_KEY: KEY_PUBLIC, VAPID_PRIVATE_KEY: KEY_PRIVATE }),
    );
    const actor = { id: 'user-1', organizationId: 'org-1' } as never;
    const keys = { p256dh: 'p256dh-key-x', auth: 'auth-x' };
    for (const endpoint of [
      'https://127.0.0.1:9555/interno',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evilfcm.googleapis.com.attacker.test/x',
      'https://fcm.googleapis.com:8443/x',
      'https://user:pw@fcm.googleapis.com/x',
      'http://fcm.googleapis.com/x',
    ]) {
      await expect(service.subscribe(actor, { endpoint, keys })).rejects.toThrow(
        'no es compatible',
      );
    }
    expect(withOrgContext).not.toHaveBeenCalled();
  });

  it('acepta los servicios de push de Chrome, Firefox, Safari y Edge', async () => {
    const withOrgContext = jest.fn().mockResolvedValue(undefined);
    const service = new WebPushService(
      { withOrgContext } as never,
      config({ VAPID_PUBLIC_KEY: KEY_PUBLIC, VAPID_PRIVATE_KEY: KEY_PRIVATE }),
    );
    const actor = { id: 'user-1', organizationId: 'org-1' } as never;
    const keys = { p256dh: 'p256dh-key-x', auth: 'auth-x' };
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QGx',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) {
      await service.subscribe(actor, { endpoint, keys });
    }
    expect(withOrgContext).toHaveBeenCalledTimes(4);
  });

  it('AF-N04: nunca envía a una suscripción guardada fuera de la lista', async () => {
    const rows = [
      { endpoint: 'https://127.0.0.1:9555/interno', p256dh: 'p', auth: 'a' },
      { endpoint: 'https://fcm.googleapis.com/fcm/send/ok', p256dh: 'p', auth: 'a' },
    ];
    const { prisma } = prismaStub(rows);
    sendNotification.mockResolvedValue({});
    const service = new WebPushService(
      prisma,
      config({ VAPID_PUBLIC_KEY: KEY_PUBLIC, VAPID_PRIVATE_KEY: KEY_PRIVATE }),
    );
    await service.sendToUser('user-1', { title: 'x' });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][0].endpoint).toBe(rows[1].endpoint);
  });
});
