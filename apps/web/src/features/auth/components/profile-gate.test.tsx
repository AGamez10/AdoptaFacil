import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../../shell/api/api-error';
import { MockAuthApi } from '../../../shell/api/mock-auth-api';
import { AppProviders } from '../../../shell/app-providers';
import { isProfileGateCancelled, useProfileGate } from './profile-gate';

const incomplete = (missing: string[]) =>
  new ApiError(422, 'unprocessable', 'Incomplete profile', {
    error: 'INCOMPLETE_PROFILE',
    missing,
  });

function Harness({ action }: { action: () => Promise<string> }) {
  const gate = useProfileGate();
  const [result, setResult] = useState('');
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void gate
            .run(action, 'Para inscribirte necesitamos tus datos.')
            .then(setResult)
            .catch((e: unknown) => setResult(isProfileGateCancelled(e) ? 'cancelado' : 'error'))
        }
      >
        Inscribirme
      </button>
      <p data-testid="result">{result}</p>
      {gate.dialog}
    </>
  );
}

function renderHarness(action: () => Promise<string>) {
  const authApi = new MockAuthApi();
  return render(
    <AppProviders session={{ initialStatus: 'authenticated', authApi }}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Harness action={action} />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe('useProfileGate', () => {
  it('asks only the missing fields on top of the action and then finishes THAT action', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(incomplete(['phone', 'address']))
      .mockResolvedValueOnce('inscrito');
    renderHarness(action);

    await user.click(screen.getByRole('button', { name: 'Inscribirme' }));
    const dialog = await screen.findByTestId('profile-gate');
    expect(dialog).toHaveTextContent('Para inscribirte necesitamos tus datos.');
    expect(screen.getByLabelText(/Teléfono de contacto/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Dirección/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Documento de identidad/)).toBeNull();

    await user.type(screen.getByLabelText(/Teléfono de contacto/), '3001234567');
    await user.type(screen.getByLabelText(/Dirección/), 'Bogotá');
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('inscrito'));
    expect(action).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('profile-gate')).toBeNull();
  });

  it('closing the window sends nothing else and tells the caller it was cancelled', async () => {
    const user = userEvent.setup();
    const action = vi.fn<() => Promise<string>>().mockRejectedValue(incomplete(['documentId']));
    renderHarness(action);

    await user.click(screen.getByRole('button', { name: 'Inscribirme' }));
    await screen.findByTestId('profile-gate');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('cancelado'));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('passes any other error straight through', async () => {
    const user = userEvent.setup();
    renderHarness(() => Promise.reject(new ApiError(500, 'server', 'boom')));
    await user.click(screen.getByRole('button', { name: 'Inscribirme' }));
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('error'));
    expect(screen.queryByTestId('profile-gate')).toBeNull();
  });
});
