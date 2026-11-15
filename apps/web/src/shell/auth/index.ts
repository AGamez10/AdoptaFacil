// Session/auth layer of the app shell. Integration point for the real session (T-022).
export {
  SessionProvider,
  useSession,
  type SessionStatus,
  type RolesStatus,
  type SessionUser,
  type SessionContextValue,
  type SessionProviderProps,
  type GoogleSignInResult,
} from './session-context';
export { RequireAuth, type RequireAuthProps } from './require-auth';
export { RequireRoles, type RequireRolesProps } from './require-roles';
export { safeReturnTo, accessPathWithReturn, returnPathOf } from './return-to';
export {
  savePendingIntent,
  peekPendingIntent,
  takePendingIntent,
  clearPendingIntent,
  markWelcome,
  takeWelcome,
  intentLabelFor,
  type PendingIntent,
  type WelcomeNote,
} from './pending-intent';
