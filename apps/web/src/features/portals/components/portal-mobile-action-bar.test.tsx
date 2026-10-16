import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PortalMobileActionBar } from './portal-mobile-action-bar';

function renderBar(props: Parameters<typeof PortalMobileActionBar>[0]) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PortalMobileActionBar {...props} />
    </MemoryRouter>,
  );
}

describe('PortalMobileActionBar', () => {
  it('offers "Adoptar" (to the catalog) and "Donar" when the organization receives donations', () => {
    const onAdopt = vi.fn();
    renderBar({ onAdopt, donateHref: '/donar?org=1' });

    fireEvent.click(screen.getByRole('button', { name: 'Adoptar' }));
    expect(onAdopt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Donar' })).toHaveAttribute('href', '/donar?org=1');
  });

  it('never promises "Donar" without a donation link', () => {
    renderBar({ onAdopt: vi.fn() });
    expect(screen.queryByRole('link', { name: 'Donar' })).not.toBeInTheDocument();
  });

  it('marks the page so the help button moves above the bar, and unmarks it on leave', () => {
    const { unmount } = renderBar({ onAdopt: vi.fn() });
    expect(document.documentElement).toHaveClass('af-has-bottom-bar');
    unmount();
    expect(document.documentElement).not.toHaveClass('af-has-bottom-bar');
  });
});
