import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LegalIndexPage } from './legal-index-page';

vi.mock('../../../shell/layout', () => ({
  PublicNavbar: () => null,
  PublicFooter: () => null,
  PublicPageHero: ({ title }: { title: string }) => <h1>{title}</h1>,
  PublicPageBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('LegalIndexPage · quién opera AdoptaFácil', () => {
  it('muestra al titular del RUT (persona natural, NIT, actividad, responsabilidad y dirección) sin la cédula', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LegalIndexPage />
      </MemoryRouter>,
    );
    const block = screen.getByTestId('legal-operator');
    expect(
      within(block).getByText(/Andres Felipe Gamez Arias, persona natural/),
    ).toBeInTheDocument();
    expect(within(block).getByText('1.004.356.866-5')).toBeInTheDocument();
    expect(within(block).getByText(/6201/)).toBeInTheDocument();
    expect(within(block).getByText(/05 · Impuesto de renta/)).toBeInTheDocument();
    expect(within(block).getByText(/Bogotá D\.C\./)).toBeInTheDocument();
    expect(block.textContent).toMatch(/directo a la cuenta de Mercado Pago de\s+cada refugio/);
    expect(block.textContent).not.toMatch(/cédula/i);
    expect(block.textContent).not.toContain('00andresgamez');
  });
});
