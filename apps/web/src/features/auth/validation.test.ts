import { describe, expect, it } from 'vitest';
import {
  collectErrors,
  loginErrorMessage,
  registerErrorMessage,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
  validateRequired,
} from './validation';

describe('auth validation', () => {
  it('validates required fields', () => {
    expect(validateRequired('', 'El nombre')).toBe('El nombre es obligatorio.');
    expect(validateRequired('   ')).toBeDefined();
    expect(validateRequired('Fido')).toBeUndefined();
  });

  it('validates email format', () => {
    expect(validateEmail('')).toBeDefined();
    expect(validateEmail('not-an-email')).toBe('Ingresa un correo válido.');
    expect(validateEmail('user@example.com')).toBeUndefined();
  });

  it('enforces a minimum password length', () => {
    expect(validatePassword('')).toBeDefined();
    expect(validatePassword('short')).toContain('al menos');
    expect(validatePassword('longenough12')).toBeUndefined();
  });

  it('checks password confirmation matches', () => {
    expect(validatePasswordConfirmation('abcd1234', '')).toBeDefined();
    expect(validatePasswordConfirmation('abcd1234', 'different')).toBe(
      'Las contraseñas no coinciden.',
    );
    expect(validatePasswordConfirmation('abcd1234', 'abcd1234')).toBeUndefined();
  });

  it('collects only the failing fields', () => {
    const { errors, isValid } = collectErrors({
      a: undefined,
      b: 'boom',
      c: undefined,
    });
    expect(isValid).toBe(false);
    expect(errors).toEqual({ b: 'boom' });

    const ok = collectErrors({ a: undefined });
    expect(ok.isValid).toBe(true);
    expect(ok.errors).toEqual({});
  });
});

describe('loginErrorMessage', () => {
  it('keeps wrong credentials generic', () => {
    expect(loginErrorMessage(401)).toBe(
      'No pudimos iniciar sesión. Revisa tu correo y contraseña.',
    );
  });

  it('tells a rate-limited person to wait instead of blaming the password', () => {
    expect(loginErrorMessage(429)).toMatch(/Espera un minuto/);
  });

  it('separates an unreachable or failing server from bad credentials', () => {
    expect(loginErrorMessage(0)).toMatch(/conectar con el servidor/);
    expect(loginErrorMessage(503)).toMatch(/El servidor tuvo un problema/);
  });
});

describe('registerErrorMessage', () => {
  it('keeps the taken-email message for a 409', () => {
    expect(registerErrorMessage(409, 'conflict')).toBe('Ya existe una cuenta con este correo.');
  });

  it('says the service is unavailable when the API cannot be reached or fails', () => {
    expect(registerErrorMessage(0, 'network_error')).toMatch(/^El servicio no está disponible/);
    expect(registerErrorMessage(503, 'service_unavailable')).toMatch(
      /^El servicio no está disponible/,
    );
  });

  it('asks to wait on a rate limit and to review the data otherwise', () => {
    expect(registerErrorMessage(429, 'too_many_requests')).toMatch(/Espera un minuto/);
    expect(registerErrorMessage(400, 'bad_request')).toBe(
      'No pudimos crear la cuenta. Revisa los datos e inténtalo de nuevo.',
    );
  });
});
