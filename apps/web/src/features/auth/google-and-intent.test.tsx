import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPEN_CAPABILITIES, renderShell } from '../../test-utils';
import {
  intentLabelFor,
  peekPendingIntent,
  savePendingIntent,
  takePendingIntent,
} from '../../shell/auth/pending-intent';

const GOOGLE_ID = '123456789012-abcdefghijklmnop.apps.googleusercontent.com';

function answerPrompts(...answers: string[]) {
  const prompt = vi.spyOn(window, 'prompt');
  for (const answer of answers) prompt.mockReturnValueOnce(answer);
}

afterEach(() => vi.restoreAllMocks());

describe('pending intent memory', () => {
  it('keeps a safe internal route with its state and hands it out once', () => {
    savePendingIntent({ to: '/campanas/abc?vista=1', state: { amount: 20000 } });
    expect(peekPendingIntent()).toEqual({ to: '/campanas/abc?vista=1', state: { amount: 20000 } });
    expect(takePendingIntent()?.to).toBe('/campanas/abc?vista=1');
    expect(takePendingIntent()).toBeNull();
  });

  it('never stores an external or access route', () => {
    savePendingIntent({ to: 'https://evil.example' });
    savePendingIntent({ to: '//evil.example' });
    savePendingIntent({ to: '/login' });
    expect(peekPendingIntent()).toBeNull();
  });

  it('expires after two hours', () => {
    savePendingIntent({ to: '/voluntariados' });
    expect(peekPendingIntent(Date.now() + 3 * 60 * 60 * 1000)).toBeNull();
  });

  it('names the action in the person’s words', () => {
    expect(intentLabelFor('/o/patitas/donar')).toBe('donar a esta organización');
    expect(intentLabelFor('/voluntariados?id=1')).toBe('inscribirte a una jornada de voluntariado');
    expect(intentLabelFor('/')).toBeNull();
  });
});

describe('Google sign-in keeps what the person came to do', () => {
  it('returns to the action and welcomes a brand-new account', async () => {
    const user = userEvent.setup();
    renderShell({
      route: '/login?returnTo=%2Fvoluntariados',
      session: { initialStatus: 'unauthenticated' },
    });
    answerPrompts('nueva.persona@example.com', 'Nueva Persona');
    await user.click(screen.getByTestId('google-sign-in-fake-button'));

    const notice = await screen.findByTestId('welcome-notice');
    expect(notice).toHaveTextContent('¡Te damos la bienvenida a AdoptaFácil, Nueva!');
    expect(notice).toHaveTextContent('inscribirte a una jornada de voluntariado');
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).toBeNull();
  });

  it('remembers the action when the person reaches login again without it in the URL', async () => {
    const first = renderShell({
      route: '/login?returnTo=%2Fcampanas%2Fabc',
      session: { initialStatus: 'unauthenticated' },
    });
    first.unmount();

    renderShell({ route: '/login', session: { initialStatus: 'unauthenticated' } });
    expect(screen.getByTestId('login-intent')).toHaveTextContent('aportar a una campaña');
    expect(screen.getByRole('link', { name: 'Regístrate' })).toHaveAttribute(
      'href',
      '/register?returnTo=%2Fcampanas%2Fabc',
    );
  });

  it('shows Google first on the register page and opens the personal tab for an action', () => {
    renderShell({
      route: '/register?returnTo=%2Fvoluntariados',
      session: { initialStatus: 'unauthenticated' },
    });
    expect(screen.getByTestId('register-google')).toBeInTheDocument();
    expect(screen.getByTestId('register-intent')).toHaveTextContent(
      'inscribirte a una jornada de voluntariado',
    );
    expect(screen.getByRole('tab', { name: 'Persona' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows Google on the register page even on the organization tab', () => {
    renderShell({ route: '/register', session: { initialStatus: 'unauthenticated' } });
    expect(screen.getByRole('tab', { name: 'Organización' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('register-google')).toBeInTheDocument();
  });

  it('uses the Client ID the API publishes: real Google button, never the test one', async () => {
    renderShell({
      route: '/login',
      session: { initialStatus: 'unauthenticated' },
      capabilities: { ...OPEN_CAPABILITIES, googleClientId: GOOGLE_ID },
    });
    await waitFor(() => expect(screen.getByTestId('google-sign-in-container')).toBeInTheDocument());
    expect(screen.queryByTestId('google-sign-in-fake-button')).toBeNull();
  });
});
