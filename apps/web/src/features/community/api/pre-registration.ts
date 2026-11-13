import type {
  CommunityPreRegistrationInput,
  CommunityPreRegistrationReceipt,
} from '@adoptafacil/contracts';
import { ApiError } from '../../../shell/api/api-error';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * `POST /public/community/pre-registrations`: deja el interés de un comercio o
 * profesional en aparecer en la Comunidad. Sin token: no hay cuenta todavía.
 */
export async function submitCommunityPreRegistration(
  input: CommunityPreRegistrationInput,
): Promise<CommunityPreRegistrationReceipt> {
  const response = await fetch(`${API_BASE}/public/community/pre-registrations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    const message =
      typeof body?.message === 'string' ? body.message : 'No pudimos guardar tu registro.';
    throw new ApiError(response.status, 'pre_registration_failed', message);
  }
  return (await response.json()) as CommunityPreRegistrationReceipt;
}
