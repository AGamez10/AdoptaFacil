import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@plataforma.test',
        roles,
        organizationId: 'org-self',
        accountType: 'organization' as const,
      },
    },
  };
}

const LIST = [
  {
    event: 'donation.thanks',
    label: 'Agradecimiento por donación',
    description: 'Se envía cuando el pago de una donación queda confirmado.',
    audience: 'La persona que donó',
    category: 'transactional',
    theme: 'donation',
    required: false,
    enabled: true,
    activeVersion: 2,
    latestVersion: 2,
  },
  {
    event: 'community.campaign_update',
    label: 'Novedades de campaña a donantes',
    description: 'Novedades.',
    audience: 'Donantes anteriores',
    category: 'bulk',
    theme: 'community',
    required: false,
    enabled: false,
    activeVersion: null,
    latestVersion: null,
  },
];

const DETAIL = {
  ...LIST[0],
  variables: [
    {
      name: 'organizacion',
      label: 'Nombre de la organización',
      kind: 'text',
      example: 'Huellitas',
    },
    { name: 'monto', label: 'Monto donado', kind: 'money', example: '50000' },
  ],
  ctaUrlVariable: 'enlace',
  defaultContent: { subject: 'Gracias', preheader: '', heading: 'Gracias', body: 'Hola' },
  activeContent: {
    subject: 'Gracias {{organizacion}}',
    preheader: 'p',
    heading: 'Gracias',
    body: 'Hola',
  },
  versions: [
    {
      version: 2,
      subject: 's',
      preheader: '',
      heading: 'h',
      body: 'b',
      createdAt: '2026-10-08T21:00:00.000Z',
    },
  ],
};

type Call = { url: string; init?: RequestInit };

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      const body = handler(String(input), init);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => body,
        text: async () => JSON.stringify(body),
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('Superadmin email templates', () => {
  it('lists service and bulk emails with their state', async () => {
    stubFetch(() => LIST);
    renderShell({ route: '/plataforma/correos', ...sessionWith([Role.PlatformAdmin]) });

    expect(await screen.findByText('Agradecimiento por donación')).toBeInTheDocument();
    expect(screen.getByText('Correos de servicio')).toBeInTheDocument();
    expect(screen.getByText('Envíos masivos')).toBeInTheDocument();
    expect(screen.getByText('Versión 2')).toBeInTheDocument();
    expect(screen.getByText('Apagado')).toBeInTheDocument();
  });

  it('is not reachable for an org role', async () => {
    const calls = stubFetch((url) => (url.endsWith('/platform/email-templates') ? LIST : []));
    renderShell({ route: '/plataforma/correos', ...sessionWith([Role.Owner]) });
    await waitFor(() =>
      expect(screen.queryByText('Agradecimiento por donación')).not.toBeInTheDocument(),
    );
    expect(calls.some((c) => c.url.endsWith('/platform/email-templates'))).toBe(false);
  });

  it('editor renders the server preview in a sandboxed iframe and saves a new active version', async () => {
    const calls = stubFetch((url, init) => {
      if (url.endsWith('/preview')) {
        return { subject: 'Gracias Huellitas', preheader: 'p', html: '<p>hola</p>', text: 'hola' };
      }
      if (url.endsWith('/versions') && init?.method === 'POST') {
        return { ...DETAIL, activeVersion: 3, latestVersion: 3 };
      }
      return DETAIL;
    });
    renderShell({
      route: '/plataforma/correos/donation.thanks',
      ...sessionWith([Role.PlatformSuperAdmin]),
    });

    const subject = await screen.findByLabelText('Asunto');
    const frame = await screen.findByTitle('Vista previa del correo');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(await screen.findByText('Gracias Huellitas')).toBeInTheDocument();

    await userEvent.clear(subject);
    await userEvent.type(subject, 'Mil gracias');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y activar' }));

    await waitFor(() => {
      const save = calls.find((c) => c.url.endsWith('/versions'));
      expect(save).toBeDefined();
      expect(JSON.parse(String(save?.init?.body))).toMatchObject({
        subject: 'Mil gracias',
        activate: true,
      });
    });
  });

  it('editor lets the admin pick the color and icon and sends them with the version', async () => {
    const calls = stubFetch((url, init) => {
      if (url.endsWith('/preview')) {
        return { subject: 'Gracias', preheader: 'p', html: '<p>hola</p>', text: 'hola' };
      }
      if (url.endsWith('/versions') && init?.method === 'POST') {
        return { ...DETAIL, activeVersion: 3, latestVersion: 3 };
      }
      return DETAIL;
    });
    renderShell({
      route: '/plataforma/correos/donation.thanks',
      ...sessionWith([Role.PlatformSuperAdmin]),
    });

    await screen.findByLabelText('Asunto');
    await userEvent.click(screen.getByRole('button', { name: 'Morado' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ícono 🎉' }));
    expect(screen.getByRole('button', { name: 'Morado' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y activar' }));

    await waitFor(() => {
      const save = calls.find((c) => c.url.endsWith('/versions'));
      expect(JSON.parse(String(save?.init?.body))).toMatchObject({
        accentColor: 'purple',
        icon: '🎉',
      });
    });
  });
});

describe('Public unsubscribe page', () => {
  const h = 'a'.repeat(64);
  const t = 'b'.repeat(43);

  it('does nothing on load and unsubscribes only after an explicit click', async () => {
    const calls = stubFetch(() => ({ unsubscribed: true }));
    renderShell({ route: `/correo/baja?h=${h}&t=${t}` });

    const button = await screen.findByRole('button', { name: 'Sí, no quiero recibir más' });
    expect(calls.filter((c) => c.url.includes('/public/email/unsubscribe'))).toHaveLength(0);
    await userEvent.click(button);
    expect(await screen.findByText('Listo, no te escribiremos más novedades')).toBeInTheDocument();
    const call = calls.find((c) => c.url.includes('/public/email/unsubscribe'));
    expect(JSON.parse(String(call?.init?.body))).toEqual({ h, t });
  });

  it('rejects a malformed link without calling the API', async () => {
    const calls = stubFetch(() => ({}));
    renderShell({ route: '/correo/baja?h=zz&t=1' });
    expect(await screen.findByText('Este enlace no es válido')).toBeInTheDocument();
    expect(calls.filter((c) => c.url.includes('/public/email/unsubscribe'))).toHaveLength(0);
  });
});
