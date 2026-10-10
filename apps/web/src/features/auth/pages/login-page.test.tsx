import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../shell/api/api-error';
import { MockAuthApi } from '../../../shell/api/mock-auth-api';
import { renderShell } from '../../../test-utils';

describe('LoginPage', () => {
  it('validates required fields before submitting', async () => {
    const user = userEvent.setup();
    renderShell({ route: '/login', session: { initialStatus: 'unauthenticated' } });

    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('El correo es obligatorio.')).toBeInTheDocument();
    expect(screen.getByText('La contraseña es obligatoria.')).toBeInTheDocument();
  });

  it('shows a generic error on invalid credentials without leaking details', async () => {
    const user = userEvent.setup();
    renderShell({ route: '/login', session: { initialStatus: 'unauthenticated' } });

    await user.type(screen.getByLabelText('Correo electrónico'), 'nobody@nowhere.com');
    await user.type(screen.getByLabelText('Contraseña'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos iniciar sesión. Revisa tu correo y contraseña.');
    // Must not reveal which field failed or whether the account exists.
    expect(alert.textContent).not.toMatch(/existe|invalid_credentials|correo no|usuario/i);
    // Still on the login screen.
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('tells the user to wait a minute when the login rate limit answers 429', async () => {
    const user = userEvent.setup();
    const authApi = new MockAuthApi();
    authApi.login = () =>
      Promise.reject(new ApiError(429, 'too_many_requests', 'Too Many Requests'));
    renderShell({ route: '/login', session: { initialStatus: 'unauthenticated', authApi } });

    await user.type(screen.getByLabelText('Correo electrónico'), 'owner@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'password-123456');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Hiciste varios intentos seguidos. Espera un minuto');
    expect(alert).not.toHaveTextContent('Revisa tu correo y contraseña');
  });

  it('says the server is unreachable instead of blaming the password when the API is down', async () => {
    const user = userEvent.setup();
    const authApi = new MockAuthApi();
    authApi.login = () => Promise.reject(new TypeError('Failed to fetch'));
    renderShell({ route: '/login', session: { initialStatus: 'unauthenticated', authApi } });

    await user.type(screen.getByLabelText('Correo electrónico'), 'owner@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'password-123456');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar con el servidor',
    );
  });

  it('F-LANDING-02: shows a "Volver al inicio" link to the public general portal', () => {
    renderShell({ route: '/login', session: { initialStatus: 'unauthenticated' } });
    expect(screen.getByRole('link', { name: '← Volver al inicio' })).toHaveAttribute('href', '/');
  });

  it('F1-03+: "Volver al inicio" is a SECONDARY (outline) button, not the primary CTA style', () => {
    renderShell({ route: '/login', session: { initialStatus: 'unauthenticated' } });
    const backLink = screen.getByRole('link', { name: '← Volver al inicio' });
    expect(backLink.className).toContain('button--outline');
    expect(backLink.className).not.toContain('button--primary');
    // "Iniciar sesión" (the submit button) stays the SOLID protagonist.
    expect(screen.getByRole('button', { name: 'Iniciar sesión' }).className).toContain(
      'button--primary',
    );
  });
});
