import { z } from 'zod';
import { legalAcceptancesSchema } from '../legal/legal.schemas';
import { MIN_PASSWORD_LENGTH } from '@adoptafacil/contracts';

/** Runtime validation schemas for the auth DTOs published in
 *  `@adoptafacil/contracts`. Kept here (not in contracts) so the contract stays
 *  a dependency-free type surface for the web app. */

const email = z.string().trim().toLowerCase().email().max(320);
/** Policy for any NEW password (AF-026). Exported so every flow that sets a
 *  password (registration, reset, invitation acceptance) shares it. */
export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200);
const password = newPasswordSchema;
const name = z.string().trim().min(1).max(200);

// `legalAcceptances` es opcional en la forma (contrato aditivo), pero el
// servicio exige los documentos obligatorios del tipo de cuenta en su versión
// vigente: sin ellos no se crea la cuenta (Ley 1581, autorización previa).
export const registerOrganizationSchema = z.object({
  organizationName: name,
  displayName: name,
  email,
  password,
  legalAcceptances: legalAcceptancesSchema.optional(),
});

export const registerPersonSchema = z.object({
  displayName: name,
  email,
  password,
  legalAcceptances: legalAcceptancesSchema.optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export const passwordResetRequestSchema = z.object({
  email,
});

// Same password-strength policy as registration (reuses `password` above), so a
// reset can never set a credential weaker than what registration would accept.
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1).max(512),
  password,
});

// T-Google-SignIn: the raw ID token from Google Identity Services (or the
// FakeIdentityAdapter's documented "fake:<email>:<name>" / base64url-JSON
// format in dev). Verified server-side via IdentityPort — never trusted as-is.
export const googleSignInSchema = z.object({
  idToken: z.string().min(1),
});

// T-Google-SignIn: `PATCH /users/me/profile`. Every field independently
// optional (a caller may fill in just the ones still missing); an empty
// object is a no-op, never an error.
export const completeProfileSchema = z.object({
  phone: z.string().trim().min(1).max(40).optional(),
  documentId: z.string().trim().min(1).max(40).optional(),
  address: z.string().trim().min(1).max(300).optional(),
});
