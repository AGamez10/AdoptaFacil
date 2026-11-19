import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../shell/api';
import { planCheckoutErrorToast } from './org-plan-page';

describe('mensaje cuando no se puede pagar el plan', () => {
  it('durante el piloto dice que no hay nada que pagar', () => {
    const toast = planCheckoutErrorToast(
      new ApiError(409, 'conflict', 'Durante el piloto todas las funciones son gratis.'),
    );
    expect(toast.title).toBe('No hay nada que pagar todavía');
  });

  it('sin pasarela configurada muestra el motivo real de la API', () => {
    const toast = planCheckoutErrorToast(
      new ApiError(503, 'unavailable', 'El pago de planes en línea todavía no está disponible.'),
    );
    expect(toast.description).toContain('El pago de planes en línea todavía no está disponible.');
    expect(toast.description).toContain('WhatsApp');
  });

  it('un rol sin permiso sabe a quién pedírselo', () => {
    expect(planCheckoutErrorToast(new ApiError(403, 'forbidden', 'x')).title).toBe(
      'Tu rol no puede pagar el plan',
    );
  });

  it('un error de red da un mensaje genérico, nunca el texto técnico', () => {
    const toast = planCheckoutErrorToast(new Error('Failed to fetch'));
    expect(toast.description).not.toContain('Failed to fetch');
  });
});
