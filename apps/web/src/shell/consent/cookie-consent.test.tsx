import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CookieConsentBanner } from './cookie-consent-banner';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_POLICY_VERSION,
  hasCookieConsent,
  loadScriptWithConsent,
  openCookieSettings,
  readCookieConsent,
  saveCookieConsent,
} from './cookie-consent';

function renderBanner() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CookieConsentBanner />
    </MemoryRouter>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  window.localStorage.clear();
  document.head.querySelectorAll('script[data-consent-src]').forEach((s) => s.remove());
});

describe('CookieConsentBanner', () => {
  it('sale en la primera visita con los tres botones y el enlace a la política', () => {
    renderBanner();
    const banner = screen.getByTestId('cookie-banner');
    expect(within(banner).getByText('Nos importa tu privacidad')).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Aceptar todo' })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Rechazar todo' })).toBeInTheDocument();
    expect(
      within(banner).getByRole('button', { name: 'Configuración de cookies' }),
    ).toBeInTheDocument();
    expect(within(banner).getByRole('link', { name: 'Política de cookies' })).toHaveAttribute(
      'href',
      '/legal/cookies',
    );
  });

  it('"Aceptar todo" guarda las tres categorías y oculta el aviso', async () => {
    renderBanner();
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar todo' }));
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
    expect(readCookieConsent()).toMatchObject({
      policyVersion: COOKIE_POLICY_VERSION,
      necessary: true,
      statistics: true,
      marketing: true,
    });
  });

  it('"Rechazar todo" deja solo las obligatorias', async () => {
    renderBanner();
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar todo' }));
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
    expect(readCookieConsent()).toMatchObject({ statistics: false, marketing: false });
  });

  it('la configuración arranca apagada y guarda solo lo que el visitante enciende', async () => {
    renderBanner();
    await userEvent.click(screen.getByRole('button', { name: 'Configuración de cookies' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Siempre activo')).toBeInTheDocument();
    const stats = within(dialog).getByRole('switch', { name: 'Cookies para estadísticas' });
    const mkt = within(dialog).getByRole('switch', { name: 'Cookies de marketing' });
    expect(stats).toHaveAttribute('aria-checked', 'false');
    expect(mkt).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(stats);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(readCookieConsent()).toMatchObject({ statistics: true, marketing: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
  });

  it('no sale si ya hay decisión, y se reabre con "Configurar cookies"', async () => {
    saveCookieConsent({ statistics: false, marketing: true });
    renderBanner();
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
    act(() => openCookieSettings());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('switch', { name: 'Cookies de marketing' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('vuelve a salir si la decisión es de otra versión de la política', () => {
    window.localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({
        policyVersion: '1999-01-01',
        necessary: true,
        statistics: true,
        marketing: true,
        decidedAt: new Date().toISOString(),
      }),
    );
    renderBanner();
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();
  });
});

describe('loadScriptWithConsent', () => {
  const src = 'https://example.test/analytics.js';
  const injected = () => document.head.querySelector(`script[data-consent-src="${src}"]`);

  it('no carga nada sin consentimiento', () => {
    const stop = loadScriptWithConsent('statistics', src);
    expect(injected()).toBeNull();
    expect(hasCookieConsent('statistics')).toBe(false);
    stop();
  });

  it('carga el script cuando el visitante acepta esa categoría, y no otra', () => {
    const stop = loadScriptWithConsent('statistics', src);
    saveCookieConsent({ statistics: false, marketing: true });
    expect(injected()).toBeNull();
    saveCookieConsent({ statistics: true, marketing: false });
    expect(injected()).not.toBeNull();
    stop();
  });
});
