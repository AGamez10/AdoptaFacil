import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Action } from '@remix-run/router';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { transitionDirection, ViewTransitionRouter } from './view-transition-router';

let navigate: ReturnType<typeof useNavigate>;
function Grab() {
  navigate = useNavigate();
  return null;
}

function renderApp() {
  render(
    <ViewTransitionRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Grab />
      <Routes>
        <Route path="/" element={<h1>Inicio</h1>} />
        <Route path="/adoptar" element={<h1>Adoptar</h1>} />
      </Routes>
    </ViewTransitionRouter>,
  );
}

type Arg = (() => Promise<void> | void) | { update: () => Promise<void> | void; types?: string[] };

describe('transitionDirection', () => {
  const at = (pathname: string) => ({ pathname });
  it('slides forward on a new screen and backward on back', () => {
    expect(transitionDirection(at('/'), { action: Action.Push, location: at('/adoptar') })).toBe(
      'forward',
    );
    expect(transitionDirection(at('/adoptar'), { action: Action.Pop, location: at('/') })).toBe(
      'backward',
    );
  });

  it('does not animate filters, anchors or redirects', () => {
    expect(
      transitionDirection(at('/adoptar'), { action: Action.Push, location: at('/adoptar') }),
    ).toBeNull();
    expect(
      transitionDirection(at('/login'), { action: Action.Replace, location: at('/inicio') }),
    ).toBeNull();
  });
});

describe('ViewTransitionRouter', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    delete (document as { startViewTransition?: unknown }).startViewTransition;
    vi.unstubAllGlobals();
  });

  it('navigates normally where View Transitions do not exist', async () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    await act(async () => navigate('/adoptar'));
    expect(screen.getByRole('heading', { name: 'Adoptar' })).toBeInTheDocument();
  });

  it('wraps a new screen in a view transition and finishes once it is painted', async () => {
    const calls: Arg[] = [];
    let updated: Promise<void> | void = undefined;
    (document as { startViewTransition?: unknown }).startViewTransition = vi.fn((arg: Arg) => {
      calls.push(arg);
      updated = typeof arg === 'function' ? arg() : arg.update();
      return { finished: Promise.resolve(updated) };
    });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    renderApp();

    await act(async () => navigate('/adoptar'));
    await act(async () => {
      await updated;
    });

    expect(calls).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Adoptar' })).toBeInTheDocument();
    // jsdom no tiene ViewTransition.prototype.types: el sentido va en el atributo.
    expect(typeof calls[0]).toBe('function');
  });

  it('skips the animation when the person prefers reduced motion', async () => {
    const start = vi.fn();
    (document as { startViewTransition?: unknown }).startViewTransition = start;
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    renderApp();

    await act(async () => navigate('/adoptar'));

    expect(start).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Adoptar' })).toBeInTheDocument();
  });
});
