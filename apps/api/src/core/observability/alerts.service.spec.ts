import { HttpException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { AlertingExceptionFilter } from './alerting-exception.filter';
import { ALERT_MAX_PER_HOUR, AlertsService, redactAlertText } from './alerts.service';

function service(url?: string) {
  const config = {
    get: (key: string) =>
      key === 'ALERT_WEBHOOK_URL'
        ? url
        : key === 'WEB_BASE_URL'
          ? 'https://adoptafacil.org'
          : undefined,
  };
  const alerts = new AlertsService(config as never);
  const send = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  alerts.send = send as never;
  return { alerts, send };
}

describe('redactAlertText', () => {
  it('removes emails, ids, long numbers and secrets', () => {
    const out = redactAlertText(
      'fallo para ana@correo.co doc 1032456789 org 3f2b1c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f token=abc.def',
    );
    expect(out).not.toMatch(/ana@|1032456789|3f2b1c4d|abc\.def/);
    expect(out).toContain('[correo]');
  });

  it('truncates long messages', () => {
    expect(redactAlertText('x'.repeat(1000)).length).toBeLessThanOrEqual(300);
  });
});

describe('AlertsService', () => {
  it('posts plain text to the webhook, once per key within the window', async () => {
    const { alerts, send } = service('https://ntfy.example/af');
    expect(await alerts.notify('k', 'Error 500 en GET /x', 1_000)).toBe(true);
    expect(await alerts.notify('k', 'Error 500 en GET /x', 2_000)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0];
    expect(url).toBe('https://ntfy.example/af');
    expect(init.body).toBe('[AdoptaFácil adoptafacil.org] Error 500 en GET /x');
    // After the window the same problem alerts again.
    expect(await alerts.notify('k', 'Error 500 en GET /x', 1_000 + 16 * 60_000)).toBe(true);
  });

  it('caps alerts per hour', async () => {
    const { alerts, send } = service('https://ntfy.example/af');
    for (let i = 0; i < ALERT_MAX_PER_HOUR + 10; i++) await alerts.notify(`k${i}`, 'x', 5_000);
    expect(send).toHaveBeenCalledTimes(ALERT_MAX_PER_HOUR);
  });

  it('without a webhook only logs, and a failing webhook never throws', async () => {
    const { alerts, send } = service(undefined);
    expect(await alerts.notify('k', 'x')).toBe(false);
    expect(send).not.toHaveBeenCalled();
    const broken = service('https://ntfy.example/af');
    broken.send.mockRejectedValue(new Error('timeout'));
    await expect(broken.alerts.notify('k', 'x')).resolves.toBe(false);
  });
});

describe('AlertingExceptionFilter', () => {
  function run(exception: unknown) {
    const notify = jest.fn().mockResolvedValue(true);
    const reply = jest.fn();
    const adapterHost = {
      httpAdapter: { reply, isHeadersSent: () => false, end: jest.fn() },
    } as unknown as HttpAdapterHost;
    const filter = new AlertingExceptionFilter(adapterHost, { notify } as never);
    const host = {
      getType: () => 'http',
      getArgByIndex: (i: number) => (i === 1 ? {} : undefined),
      getArgs: () => [],
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          baseUrl: '',
          route: { path: '/donations/:id' },
          headers: {},
        }),
        getResponse: () => ({}),
      }),
    } as unknown as ArgumentsHost;
    filter.catch(exception, host);
    return { notify, reply };
  }

  it('alerts on an unexpected error and still answers 500', () => {
    const { notify, reply } = run(new TypeError('cannot read x of undefined'));
    expect(notify).toHaveBeenCalledWith(
      'http:POST /donations/:id:TypeError',
      expect.stringContaining('Error 500 en POST /donations/:id: TypeError'),
    );
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ statusCode: 500 }),
      500,
    );
  });

  it('does not alert on a 4xx and keeps its answer', () => {
    const { notify, reply } = run(new NotFoundException('Campaign not found'));
    expect(notify).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ statusCode: 404 }),
      404,
    );
  });

  it('alerts on a deliberate 503', () => {
    const { notify } = run(new HttpException('Mercado Pago no respondió', 503));
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
