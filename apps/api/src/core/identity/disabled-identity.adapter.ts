import { NotFoundException } from '@nestjs/common';
import type { IdentityClaims, IdentityPort } from '@adoptafacil/contracts';

/**
 * IdentityPort bound when AUTH_IDENTITY_DRIVER=disabled (Ola 1, R0-1,
 * SEC-001): Google Sign-In is switched off, so `POST /auth/google` answers
 * 404 for every token. This is the production value until the client hands
 * over a real Google OAuth Client ID; the fake adapter, which accepted
 * `fake:<email>:<name>` for ANY existing account, can no longer boot there.
 */
export class DisabledIdentityAdapter implements IdentityPort {
  async verifyGoogleIdToken(_idToken: string): Promise<IdentityClaims> {
    throw new NotFoundException('Google sign-in is not enabled.');
  }
}
