import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../../test-utils';
import * as preRegistration from '../api/pre-registration';

describe('BusinessPreRegistrationPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for the data-treatment consent before sending anything', async () => {
    const submit = vi.spyOn(preRegistration, 'submitCommunityPreRegistration');
    const user = userEvent.setup();
    renderShell({
      route: '/servicios/prerregistro',
      session: { initialStatus: 'unauthenticated' },
    });

    await user.type(screen.getByLabelText('Nombre del negocio o tu nombre profesional'), 'Patitas');
    await user.type(screen.getByLabelText('Ciudad o municipio'), 'Medellín');
    await user.type(screen.getByLabelText('Tu nombre de contacto'), 'Ana Pérez');
    await user.type(screen.getByLabelText('Correo de contacto'), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: 'Quiero aparecer en la Comunidad' }));

    expect(submit).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('autorización');
  });

  it('sends the registration with consent and confirms it without asking for an account', async () => {
    const submit = vi
      .spyOn(preRegistration, 'submitCommunityPreRegistration')
      .mockResolvedValue({ received: true });
    const user = userEvent.setup();
    renderShell({
      route: '/servicios/prerregistro',
      session: { initialStatus: 'unauthenticated' },
    });

    await user.type(screen.getByLabelText('Nombre del negocio o tu nombre profesional'), 'Patitas');
    await user.type(screen.getByLabelText('Ciudad o municipio'), 'Medellín');
    await user.type(screen.getByLabelText('Tu nombre de contacto'), 'Ana Pérez');
    await user.type(screen.getByLabelText('Correo de contacto'), 'ana@example.com');
    await user.click(screen.getByRole('checkbox', { name: /Autorizo/ }));
    await user.click(screen.getByRole('button', { name: 'Quiero aparecer en la Comunidad' }));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'commerce',
        businessName: 'Patitas',
        contactEmail: 'ana@example.com',
        consent: true,
      }),
    );
    expect(await screen.findByTestId('pre-registration-received')).toBeInTheDocument();
  });
});
