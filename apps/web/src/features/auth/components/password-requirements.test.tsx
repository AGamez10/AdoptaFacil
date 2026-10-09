import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PasswordRequirements } from './password-requirements';

describe('PasswordRequirements — checklist en vivo (solo reglas reales del backend)', () => {
  it('muestra el requisito como pendiente cuando la contraseña es corta', () => {
    render(<PasswordRequirements password="abc" />);
    expect(screen.getByText('Al menos 12 caracteres')).toBeInTheDocument();
    expect(screen.getByText('○')).toBeInTheDocument();
  });

  it('marca el requisito como cumplido con 12 caracteres o más', () => {
    render(<PasswordRequirements password="abcdefghijkl" />);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });
});
