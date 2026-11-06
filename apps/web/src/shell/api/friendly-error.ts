import { friendlyMessage, messageForStatus } from '@adoptafacil/ui';
import { ApiError } from './api-error';

export { friendlyErrorMessage } from '@adoptafacil/ui';

/**
 * Para las llamadas públicas que usan `fetch` directo (portal sin sesión): arma
 * el MISMO `ApiError` amable que el cliente con sesión, a partir de la respuesta.
 */
export async function friendlyHttpError(response: Response): Promise<ApiError> {
  let body: { message?: unknown } | undefined;
  try {
    body = (await response.json()) as { message?: unknown };
  } catch {
    body = undefined;
  }
  const raw = Array.isArray(body?.message)
    ? body.message.filter((m): m is string => typeof m === 'string').join(' ')
    : typeof body?.message === 'string'
      ? body.message
      : '';
  const message = raw ? friendlyMessage(raw, response.status) : messageForStatus(response.status);
  return new ApiError(response.status, 'http_error', message, body);
}
