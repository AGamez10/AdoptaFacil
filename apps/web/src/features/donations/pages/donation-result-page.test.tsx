import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DonationResultPage } from './donation-result-page';

describe('DonationResultPage', () => {
  it('never claims approval from the query string, only that the payment is being confirmed', () => {
    render(
      <MemoryRouter initialEntries={['/donaciones/resultado?status=approved&reference=af-1']}>
        <DonationResultPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Estamos confirmando tu pago/)).toBeInTheDocument();
    expect(screen.queryByText(/aprobada/i)).not.toBeInTheDocument();
  });
});
