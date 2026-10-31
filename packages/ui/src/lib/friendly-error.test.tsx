import { describe, expect, it } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  friendlyErrorMessage,
  friendlyMessage,
  isTechnicalMessage,
} from './friendly-error';
import { createElement } from 'react';
import { act, render, screen } from '@testing-library/react';
import { toast } from '../components/use-toast';
import { Toaster } from '../components/toaster';

describe('friendly errors (nunca un mensaje técnico en una alerta)', () => {
  it.each([
    'Cannot POST /public/organizations/adoptafacil/reviews',
    'Failed to fetch',
    'Organization not found',
    'Internal Server Error',
    'Expected number, received string',
    'Unexpected token < in JSON at position 0',
    "TypeError: Cannot read properties of undefined (reading 'id')",
    'INCOMPLETE_PROFILE',
  ])('detects "%s" as technical', (text) => {
    expect(isTechnicalMessage(text)).toBe(true);
  });

  it.each([
    'La fecha no puede ser futura.',
    'No se pudo enviar la reseña.',
    'Ya registraste tu decisión sobre este documento.',
    'Solo el propietario define las firmas que exigen los estatutos.',
  ])('keeps the clear Spanish message "%s"', (text) => {
    expect(isTechnicalMessage(text)).toBe(false);
  });

  it('strips the validator field prefix and keeps the Spanish text', () => {
    expect(friendlyMessage('amountCop: El valor debe ser mayor que cero.', 400)).toBe(
      'El valor debe ser mayor que cero.',
    );
  });

  it('maps by status when the message is technical', () => {
    expect(friendlyMessage('Cannot POST /x', 404)).toMatch(/no está disponible/);
    expect(friendlyMessage('ThrottlerException: Too Many Requests', 429)).toMatch(
      /demasiados intentos/,
    );
    expect(friendlyMessage('', 0)).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('turns a browser network error into the connection message', () => {
    expect(friendlyErrorMessage(new TypeError('Failed to fetch'))).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('the toast itself replaces a technical description in an error alert', async () => {
    render(createElement(Toaster));
    act(() => {
      toast({
        title: 'No se pudo enviar tu reseña',
        description: 'Cannot POST /public/organizations/adoptafacil/reviews',
        variant: 'destructive',
      });
    });
    expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/Cannot POST/)).not.toBeInTheDocument();
  });
});
