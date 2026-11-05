import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { ScrollToTop } from './scroll-to-top';

let navigate: ReturnType<typeof useNavigate>;
function Grab() {
  navigate = useNavigate();
  return null;
}

function setup() {
  const scrollTo = vi.fn();
  vi.stubGlobal('scrollTo', scrollTo);
  render(
    <MemoryRouter initialEntries={['/']}>
      <ScrollToTop />
      <Grab />
    </MemoryRouter>,
  );
  scrollTo.mockClear();
  return scrollTo;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ScrollToTop', () => {
  it('opens every new page at the top', () => {
    const scrollTo = setup();
    act(() => navigate('/recursos'));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('leaves back/forward and #anchors alone', () => {
    const scrollTo = setup();
    act(() => navigate('/#organizaciones'));
    act(() => navigate(-1));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
