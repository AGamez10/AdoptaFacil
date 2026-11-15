import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReactionBar, ReactionSummary } from './reaction-bar';

describe('ReactionBar', () => {
  it('a click toggles like', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ReactionBar value={null} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('reaction-button'));
    expect(onChange).toHaveBeenLastCalledWith('like');
    rerender(<ReactionBar value="like" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('reaction-button'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('hovering opens the tray with five reactions and picking one reports it', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ReactionBar value={null} onChange={onChange} />);
    fireEvent.mouseEnter(screen.getByTestId('reaction-button').parentElement as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    vi.useRealTimers();
    const tray = screen.getByTestId('reaction-tray');
    expect(tray.querySelectorAll('button')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Me encanta' }));
    expect(onChange).toHaveBeenCalledWith('love');
  });

  it('Escape closes the tray', () => {
    vi.useFakeTimers();
    render(<ReactionBar value={null} onChange={() => undefined} />);
    fireEvent.mouseEnter(screen.getByTestId('reaction-button').parentElement as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    vi.useRealTimers();
    expect(screen.getByTestId('reaction-tray')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('reaction-tray')).not.toBeInTheDocument();
  });
});

describe('ReactionSummary', () => {
  it('says "Tú y N personas más" and hides when empty', () => {
    const { rerender } = render(<ReactionSummary counts={{ like: 3 }} total={3} mine />);
    expect(screen.getByText('Tú y 2 personas más')).toBeInTheDocument();
    rerender(<ReactionSummary counts={{}} total={0} mine={false} />);
    expect(screen.queryByTestId('reaction-summary')).not.toBeInTheDocument();
  });
});
