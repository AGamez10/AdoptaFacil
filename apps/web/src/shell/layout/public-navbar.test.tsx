import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CLOSED_CAPABILITIES } from '@adoptafacil/contracts';
import { CapabilitiesProvider } from '../capabilities';
import { OPEN_CAPABILITIES } from '../../test-utils';
import { PublicNavbar } from './public-navbar';

function renderNavbar(capabilities = OPEN_CAPABILITIES) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CapabilitiesProvider value={capabilities}>
        <PublicNavbar />
      </CapabilitiesProvider>
    </MemoryRouter>,
  );
}

describe('PublicNavbar', () => {
  it('groups every module under Adoptar · Ayudar · Comunidad · Organizaciones', async () => {
    const user = userEvent.setup();
    renderNavbar();
    const nav = screen.getByRole('navigation', { name: 'Navegación pública' });
    expect(within(nav).getByRole('link', { name: 'Adoptar' })).toHaveAttribute('href', '/adoptar');
    expect(within(nav).getByRole('link', { name: 'Organizaciones' })).toHaveAttribute(
      'href',
      '/#organizaciones',
    );

    const help = within(nav).getByRole('button', { name: 'Ayudar' });
    expect(help).toHaveAttribute('aria-expanded', 'false');
    await user.click(help);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(help.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(within(panel).getByRole('link', { name: /Donar/ })).toHaveAttribute(
      'href',
      '/donaciones',
    );
    expect(within(panel).getByRole('link', { name: /Banco de recursos/ })).toHaveAttribute(
      'href',
      '/recursos',
    );

    await user.keyboard('{Escape}');
    expect(help).toHaveAttribute('aria-expanded', 'false');
    expect(help).toHaveFocus();
  });

  it('leaves out the modules that are off (never a link to a 404)', () => {
    renderNavbar(CLOSED_CAPABILITIES);
    expect(screen.queryByRole('link', { name: /Donar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Marketplace/ })).not.toBeInTheDocument();
    // Campañas no depende de ningún módulo: sigue en su grupo (panel cerrado).
    expect(screen.getAllByRole('link', { name: /Campañas/, hidden: true }).length).toBeGreaterThan(
      0,
    );
  });
});
