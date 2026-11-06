import { describe, expect, it } from 'vitest';
import { apiErrorFromResponse } from './http';

function jsonResponse(status: number, statusText: string, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, statusText });
}

describe('apiErrorFromResponse', () => {
  it('uses a plain string `message` verbatim', async () => {
    const error = await apiErrorFromResponse(
      jsonResponse(409, 'Conflict', {
        message: 'Este nombre de portal ya está en uso. Elige otro.',
      }),
    );
    expect(error.message).toBe('Este nombre de portal ya está en uso. Elige otro.');
  });

  /**
   * Regression: `ZodValidationPipe` (backend) throws `BadRequestException(string[])`
   * — Nest serializes that as `message: string[]` VERBATIM, never joined into one
   * string. Before this fix, an array `message` fell through to the generic
   * `response.statusText` ("Bad Request"), hiding the actual validation reason
   * (e.g. the slug format message) from the user.
   */
  it('joins an array-shaped `message` (Zod validation errors) instead of falling back to statusText', async () => {
    const error = await apiErrorFromResponse(
      jsonResponse(400, 'Bad Request', {
        message: [
          'slug: Solo se permiten letras minúsculas, números y guiones — sin espacios ni tildes.',
        ],
      }),
    );
    // El mensaje en español del servidor llega tal cual, sin el prefijo técnico del campo.
    expect(error.message).toBe(
      'Solo se permiten letras minúsculas, números y guiones — sin espacios ni tildes.',
    );
  });

  it('never surfaces a technical message: a 5xx without body says it in plain Spanish', async () => {
    const error = await apiErrorFromResponse(jsonResponse(500, 'Internal Server Error', {}));
    expect(error.message).toBe(
      'Tuvimos un problema de nuestro lado. Inténtalo de nuevo en unos minutos.',
    );
  });

  it('never surfaces a technical message when the JSON body fails to parse', async () => {
    const response = new Response('not json', { status: 500, statusText: 'Internal Server Error' });
    const error = await apiErrorFromResponse(response);
    expect(error.message).not.toMatch(/Internal Server Error/);
  });

  it('turns Nest\'s "Cannot POST /…" 404 into a friendly message (keeps the raw body in details)', async () => {
    const body = {
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot POST /public/organizations/adoptafacil/reviews',
    };
    const error = await apiErrorFromResponse(jsonResponse(404, 'Not Found', body));
    expect(error.message).toBe(
      'Esta opción no está disponible en este momento o lo que buscas ya no existe.',
    );
    expect(error.details).toEqual(body);
  });

  it('maps English validator output to a friendly message', async () => {
    const error = await apiErrorFromResponse(
      jsonResponse(400, 'Bad Request', { message: ['rating: Expected number, received string'] }),
    );
    expect(error.message).toBe('Revisa los datos que escribiste e inténtalo de nuevo.');
  });
});
