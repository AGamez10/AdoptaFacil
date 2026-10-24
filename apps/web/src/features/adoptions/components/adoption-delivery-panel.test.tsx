import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { AppProviders } from '../../../shell/app-providers';
import { CONFIRMED, DELIVERY, jsonResponse } from '../test-fixtures-delivery';
import { AdoptionDeliveryPanel } from './adoption-delivery-panel';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QR') },
}));

/**
 * Ajuste 6 — panel "Entregar" de la organización: valida la foto obligatoria y
 * la identidad, sube la foto, registra la entrega y muestra el QR con el código.
 */
function renderPanel() {
  return render(
    <AppProviders
      session={{
        initialStatus: 'authenticated',
        initialUser: {
          id: 'u1',
          name: 'Owner',
          email: 'owner@refugio.org',
          roles: [Role.Owner],
          organizationId: 'org-1',
          accountType: 'organization',
        },
      }}
    >
      <AdoptionDeliveryPanel contractId="c1" animalName="Luna" />
    </AppProviders>,
  );
}

function stub(routes: { current: unknown }) {
  const calls: { url: string; method: string; body?: BodyInit | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body });
      if (url.endsWith('/by-contract/c1')) return jsonResponse(routes.current);
      if (url.endsWith('/photo-target'))
        return jsonResponse({ storageRef: 'private/org-1/x-foto.png', uploadUrl: '/x' }, 201);
      if (url.includes('/storage/upload')) return jsonResponse({ key: 'k', url: 'u' });
      if (url.endsWith('/adoptions/deliveries') && method === 'POST')
        return jsonResponse(
          {
            delivery: DELIVERY,
            code: '048213',
            confirmUrl: 'https://x/mis-adopciones/entrega/dl-1?codigo=048213',
          },
          201,
        );
      return jsonResponse({});
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('AdoptionDeliveryPanel', () => {
  it('requires identity and the photo, then registers the delivery and shows the QR and code', async () => {
    const user = userEvent.setup();
    const calls = stub({ current: null });
    renderPanel();

    await user.type(await screen.findByLabelText('Estado de salud al entregar'), 'Sana');
    await user.type(screen.getByLabelText('Peso (kg)'), '12,5');
    await user.click(screen.getByRole('button', { name: /Registrar la entrega/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('documento original');

    await user.click(screen.getByLabelText(/Verifiqué la identidad/));
    await user.click(screen.getByRole('button', { name: /Registrar la entrega/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('foto de Luna');

    await user.click(screen.getByLabelText('Alimento'));
    const file = new File(['png'], 'luna.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/Foto de Luna/), file);
    await user.click(screen.getByRole('button', { name: /Registrar la entrega/ }));

    expect(await screen.findByLabelText('Código de confirmación')).toHaveTextContent('048213');
    expect(screen.getByAltText('Código QR para confirmar la entrega')).toBeInTheDocument();

    const start = calls.find((c) => c.url.endsWith('/adoptions/deliveries') && c.method === 'POST');
    expect(JSON.parse(String(start?.body))).toEqual({
      contractId: 'c1',
      healthStatus: 'Sana',
      weightKg: 12.5,
      identityVerified: true,
      identificationChecked: false,
      items: ['food'],
      photoRef: 'private/org-1/x-foto.png',
    });
    expect(calls.some((c) => c.url.includes('/storage/upload') && c.method === 'PUT')).toBe(true);
  });

  it('offers a new code for a pending delivery after a reload', async () => {
    stub({ current: DELIVERY });
    renderPanel();
    expect(await screen.findByText('Esperando la confirmación del adoptante')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generar código' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar la entrega' })).toBeInTheDocument();
  });

  it('shows the confirmed delivery with its seal', async () => {
    stub({ current: CONFIRMED });
    renderPanel();
    expect(await screen.findByText('Entrega confirmada')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Huella SHA-256 del acta/)).toBeInTheDocument());
  });
});
