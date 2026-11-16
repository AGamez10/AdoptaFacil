import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrivacyRightsCard, SUPPRESSION_PHRASE } from './privacy-rights-card';

const request = vi.fn();
const signOut = vi.fn();
let accountType: 'person' | 'organization' = 'person';

vi.mock('../../../shell/api', () => ({ useApiClient: () => ({ request }) }));
vi.mock('../../../shell/auth', () => ({
  useSession: () => ({ user: { accountType }, signOut }),
}));
vi.mock('@adoptafacil/ui', async (orig) => ({
  ...(await orig<typeof import('@adoptafacil/ui')>()),
  useToast: () => ({ toast: vi.fn() }),
}));

afterEach(() => {
  vi.clearAllMocks();
  accountType = 'person';
});

describe('PrivacyRightsCard (Ley 1581)', () => {
  it('downloads the data held about the person', async () => {
    request.mockResolvedValue({ data: { account: { email: 'a@test' } } });
    const create = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<PrivacyRightsCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/me/privacy/data'));
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });

  it('suppression stays disabled until the exact phrase, then signs out and lists what is kept', async () => {
    request.mockResolvedValue({
      retained: [{ data: 'Donaciones', reason: 'Soporte tributario' }],
    });
    render(<PrivacyRightsCard />);
    const button = screen.getByRole('button', { name: 'Suprimir mi cuenta' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/para confirmar/), {
      target: { value: SUPPRESSION_PHRASE.toLowerCase() },
    });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/me/privacy/suppression', {
        method: 'POST',
        json: { confirmation: SUPPRESSION_PHRASE.toLowerCase() },
      }),
    );
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(await screen.findByText(/Soporte tributario/)).toBeInTheDocument();
  });

  it('an organization account can download its data but not suppress from here', () => {
    accountType = 'organization';
    render(<PrivacyRightsCard />);
    expect(screen.getByRole('button', { name: 'Descargar mis datos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suprimir mi cuenta' })).not.toBeInTheDocument();
  });
});
