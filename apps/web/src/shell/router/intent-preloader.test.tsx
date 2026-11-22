import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IntentPreloader, pageForHref } from './intent-preloader';

const ORIGIN = 'http://localhost:3000';

describe('pageForHref', () => {
  const portal = { preload: vi.fn() };
  const table = [['/o/:slug', portal]] as const;

  it('finds the deferred screen behind an internal link', () => {
    expect(pageForHref('/o/patitas-felices', table, ORIGIN)).toBe(portal);
    expect(pageForHref(`${ORIGIN}/o/patitas-felices?x=1`, table, ORIGIN)).toBe(portal);
  });

  it('ignores other sites and unknown screens', () => {
    expect(pageForHref('https://example.com/o/patitas', table, ORIGIN)).toBeNull();
    expect(pageForHref('/adoptar', table, ORIGIN)).toBeNull();
  });
});

describe('IntentPreloader', () => {
  it('downloads the screen once when a link is touched or focused', () => {
    const preload = vi.fn(() => Promise.resolve());
    const { getByRole } = render(
      <>
        <IntentPreloader table={[['/campanas/*', { preload }]]} />
        <a href="/campanas">Campañas</a>
      </>,
    );
    const link = getByRole('link');

    fireEvent.touchStart(link);
    fireEvent.focusIn(link);

    expect(preload).toHaveBeenCalledTimes(1);
  });
});
