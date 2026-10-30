import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CapabilitiesProvider } from '../capabilities';
import { OPEN_CAPABILITIES } from '../../test-utils';
import { PublicNavbar } from './public-navbar';

function renderNavbar(open: boolean) {
  const navbar = <PublicNavbar />;
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {open ? (
        <CapabilitiesProvider value={OPEN_CAPABILITIES}>{navbar}</CapabilitiesProvider>
      ) : (
        navbar
      )}
    </MemoryRouter>,
  );
}

describe('PublicNavbar', () => {
  it('with the MVP modules off, the links fit in one row', () => {
    renderNavbar(false);
    expect(screen.getByRole('banner')).toHaveAttribute('data-crowded', 'false');
    expect(screen.queryByRole('link', { name: 'Marketplace' })).not.toBeInTheDocument();
  });

  it('with every module on, it switches to the drop-down menu so nothing overflows', () => {
    renderNavbar(true);
    expect(screen.getByRole('banner')).toHaveAttribute('data-crowded', 'true');
    expect(screen.getAllByRole('link', { name: 'Marketplace' }).length).toBeGreaterThan(0);
  });
});
