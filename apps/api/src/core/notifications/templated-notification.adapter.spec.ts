import { getEmailEvent } from './templates/email-catalog';
import type { EmailTemplateService } from './templates/email-template.service';
import { TemplatedNotificationAdapter } from './templated-notification.adapter';

function makeTemplates(overrides: Partial<Record<keyof EmailTemplateService, jest.Mock>> = {}) {
  return {
    resolve: jest.fn(async (def: { defaults: unknown }) => ({
      enabled: true,
      activeVersion: null,
      content: def.defaults,
    })),
    isSuppressed: jest.fn().mockResolvedValue(false),
    wrapPlain: jest.fn((subject: string, body: string) => ({
      subject,
      preheader: '',
      html: `<html>${subject}</html>`,
      text: `${body}\n—\nAdoptaFácil`,
    })),
    render: jest.fn(() => ({
      subject: 'Asunto de plantilla',
      preheader: '',
      html: '<html>ok</html>',
      text: 'texto de plantilla',
      headers: { 'List-Unsubscribe': '<https://api/x>' },
    })),
    ...overrides,
  } as unknown as EmailTemplateService & Record<string, jest.Mock>;
}

const plain = { to: 'ana@example.co', subject: 'Respaldo', body: 'cuerpo de respaldo' };

describe('TemplatedNotificationAdapter', () => {
  it('wraps messages without a template in the generic AdoptaFácil layout', async () => {
    const inner = { send: jest.fn() };
    const templates = makeTemplates();
    await new TemplatedNotificationAdapter(inner, templates).send(plain);
    expect(templates.wrapPlain).toHaveBeenCalledWith('Respaldo', 'cuerpo de respaldo');
    expect(inner.send).toHaveBeenCalledWith({
      ...plain,
      body: 'cuerpo de respaldo\n—\nAdoptaFácil',
      html: '<html>Respaldo</html>',
    });
    expect(templates.resolve).not.toHaveBeenCalled();
  });

  it('leaves a message that already has HTML untouched (editor test send)', async () => {
    const inner = { send: jest.fn() };
    const templates = makeTemplates();
    const withHtml = { ...plain, html: '<p>ya diseñado</p>' };
    await new TemplatedNotificationAdapter(inner, templates).send(withHtml);
    expect(inner.send).toHaveBeenCalledWith(withHtml);
    expect(templates.wrapPlain).not.toHaveBeenCalled();
  });

  it('still sends the plain message if the generic layout fails', async () => {
    const inner = { send: jest.fn() };
    const templates = makeTemplates({
      wrapPlain: jest.fn(() => {
        throw new Error('boom');
      }),
    });
    await new TemplatedNotificationAdapter(inner, templates).send(plain);
    expect(inner.send).toHaveBeenCalledWith(plain);
  });

  it('renders the active template and keeps the caller fields (attachments)', async () => {
    const inner = { send: jest.fn() };
    const templates = makeTemplates();
    const attachments = [
      { filename: 'c.pdf', content: Buffer.from('x'), contentType: 'application/pdf' },
    ];
    await new TemplatedNotificationAdapter(inner, templates).send({
      ...plain,
      attachments,
      template: { event: 'donation.thanks', data: { monto: 1 }, organizationName: 'Huellitas' },
    });
    expect(templates.render).toHaveBeenCalledWith(
      getEmailEvent('donation.thanks'),
      getEmailEvent('donation.thanks')?.defaults,
      'ana@example.co',
      { monto: 1 },
      'Huellitas',
      undefined,
      undefined,
    );
    const sent = inner.send.mock.calls[0][0];
    expect(sent).toMatchObject({
      to: 'ana@example.co',
      subject: 'Asunto de plantilla',
      body: 'texto de plantilla',
      html: '<html>ok</html>',
      attachments,
    });
    expect(sent.template).toBeUndefined();
  });

  it('does not send an event the superadmin switched off', async () => {
    const inner = { send: jest.fn() };
    const templates = makeTemplates({
      resolve: jest.fn().mockResolvedValue({ enabled: false, activeVersion: null, content: {} }),
    });
    await new TemplatedNotificationAdapter(inner, templates).send({
      ...plain,
      template: { event: 'volunteering.enrollment_received', data: {} },
    });
    expect(inner.send).not.toHaveBeenCalled();
  });

  it('never sends a bulk email to an address that opted out (Ley 1581)', async () => {
    const inner = { send: jest.fn() };
    const templates = makeTemplates({ isSuppressed: jest.fn().mockResolvedValue(true) });
    await new TemplatedNotificationAdapter(inner, templates).send({
      ...plain,
      template: { event: 'community.campaign_update', data: {} },
    });
    expect(inner.send).not.toHaveBeenCalled();
  });

  it('fails CLOSED on bulk when the opt-out list cannot be checked', async () => {
    const inner = { send: jest.fn() };
    const templates = makeTemplates({
      isSuppressed: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await new TemplatedNotificationAdapter(inner, templates).send({
      ...plain,
      template: { event: 'community.campaign_update', data: {} },
    });
    expect(inner.send).not.toHaveBeenCalled();
  });

  it('opt-outs never block transactional emails', async () => {
    const inner = { send: jest.fn() };
    const templates = makeTemplates({ isSuppressed: jest.fn().mockResolvedValue(true) });
    await new TemplatedNotificationAdapter(inner, templates).send({
      ...plain,
      template: { event: 'auth.password_reset', data: { enlace: 'https://x.co' } },
    });
    expect(templates.isSuppressed).not.toHaveBeenCalled();
    expect(inner.send).toHaveBeenCalledTimes(1);
  });

  it('fails OPEN on service emails: template errors fall back to the plain body', async () => {
    const inner = { send: jest.fn() };
    const templates = makeTemplates({ resolve: jest.fn().mockRejectedValue(new Error('db down')) });
    await new TemplatedNotificationAdapter(inner, templates).send({
      ...plain,
      template: { event: 'auth.password_reset', data: { enlace: 'https://x.co' } },
    });
    // El respaldo en texto plano también sale con el diseño genérico.
    expect(inner.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: plain.to, subject: 'Respaldo' }),
    );
    expect(inner.send.mock.calls[0][0].html).toBe('<html>Respaldo</html>');
  });

  describe('correos con la marca de la organización', () => {
    const branded = {
      organizationName: 'Huellitas',
      brand: { accent: '#123456', button: '#123456', buttonText: '#ffffff' },
      fromName: 'Huellitas vía AdoptaFácil',
      replyTo: 'contacto@huellitas.org',
    };
    const withOrg = {
      ...plain,
      template: {
        event: 'donation.thanks' as const,
        data: { monto: 1 },
        organizationName: 'Huellitas',
        organizationId: 'org-1',
      },
    };

    it('con plan y cupo: renderiza con la marca, nombre de remitente y responder a', async () => {
      const inner = { send: jest.fn() };
      const templates = makeTemplates();
      const branding = { claim: jest.fn().mockResolvedValue(branded) };
      await new TemplatedNotificationAdapter(inner, templates, branding).send(withOrg);
      expect(branding.claim).toHaveBeenCalledWith('org-1');
      expect((templates.render as jest.Mock).mock.calls[0][5]).toEqual(branded.brand);
      expect(inner.send.mock.calls[0][0]).toMatchObject({
        fromName: 'Huellitas vía AdoptaFácil',
        replyTo: 'contacto@huellitas.org',
      });
    });

    it('sin plan o sin cupo: el correo sale igual, con la marca de AdoptaFácil', async () => {
      const inner = { send: jest.fn() };
      const templates = makeTemplates();
      const branding = { claim: jest.fn().mockResolvedValue(null) };
      await new TemplatedNotificationAdapter(inner, templates, branding).send(withOrg);
      expect(inner.send).toHaveBeenCalledTimes(1);
      expect((templates.render as jest.Mock).mock.calls[0][5]).toBeUndefined();
      expect(inner.send.mock.calls[0][0].fromName).toBeUndefined();
      expect(inner.send.mock.calls[0][0].replyTo).toBeUndefined();
    });

    it('un evento apagado no gasta cupo de marca', async () => {
      const inner = { send: jest.fn() };
      const templates = makeTemplates({
        resolve: jest.fn().mockResolvedValue({ enabled: false, activeVersion: null, content: {} }),
      });
      const branding = { claim: jest.fn().mockResolvedValue(branded) };
      await new TemplatedNotificationAdapter(inner, templates, branding).send(withOrg);
      expect(branding.claim).not.toHaveBeenCalled();
      expect(inner.send).not.toHaveBeenCalled();
    });
  });
});
