import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../../test-utils';
import { CONFIRMED, DELIVERY, jsonResponse } from '../test-fixtures-delivery';

/**
 * Ajuste 6 — el adoptante llega por el QR (código en el enlace), confirma la
 * entrega y ve la ficha; los errores del código se explican en palabras.
 */
const persona = {
  session: {
    initialStatus: 'authenticated' as const,
    initialUser: {
      id: 'u2',
      name: 'Persona',
      email: 'persona@test.local',
      roles: [],
      accountType: 'person' as const,
    },
  },
};

function stub(confirm: () => ReturnType<typeof jsonResponse>) {
  const calls: { url: string; body?: BodyInit | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body });
      if (url.endsWith('/adoptions/deliveries/mine/dl-1')) return jsonResponse(DELIVERY);
      if (url.endsWith('/adoptions/deliveries/dl-1/confirm')) return confirm();
      if (url.endsWith('/adoptions/deliveries/mine')) return jsonResponse([CONFIRMED]);
      return jsonResponse({});
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('DeliveryConfirmPage', () => {
  it('prefills the code from the QR link, confirms and shows the record', async () => {
    const user = userEvent.setup();
    const calls = stub(() => jsonResponse(CONFIRMED, 201));
    renderShell({ route: '/mis-adopciones/entrega/dl-1?codigo=048213', ...persona });

    expect(await screen.findByText('Entrega de Luna')).toBeInTheDocument();
    expect(screen.getByLabelText('Código de confirmación')).toHaveValue('048213');
    await user.click(screen.getByRole('button', { name: 'Confirmo que recibí a Luna' }));

    expect(await screen.findByText('¡Luna ya está en casa!')).toBeInTheDocument();
    expect(screen.getByText(/Microchip 985112/)).toBeInTheDocument();
    expect(screen.getByText(/tienes 4 meses para hacerla/)).toBeInTheDocument();
    const confirm = calls.find((c) => c.url.endsWith('/confirm'));
    expect(JSON.parse(String(confirm?.body))).toEqual({ code: '048213' });
  });

  it('explains a wrong code in plain words', async () => {
    const user = userEvent.setup();
    stub(() => jsonResponse({ code: 'DELIVERY_CODE_INVALID', message: 'x' }, 400));
    renderShell({ route: '/mis-adopciones/entrega/dl-1', ...persona });

    await user.type(await screen.findByLabelText('Código de confirmación'), '111111');
    await user.click(screen.getByRole('button', { name: 'Confirmo que recibí a Luna' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El código no coincide');
  });
});

describe('MyAnimalsPage', () => {
  it('lists the record of each animal already delivered', async () => {
    stub(() => jsonResponse(CONFIRMED));
    renderShell({ route: '/mis-animales', ...persona });
    expect(await screen.findByRole('heading', { name: 'Luna' })).toBeInTheDocument();
    expect(screen.getByText('Próximas dosis')).toBeInTheDocument();
    expect(screen.getByText(/Carné de vacunas físico, Alimento/)).toBeInTheDocument();
  });
});
