import { tokensFromContract, type AuthSession, type ShellApi } from '../api';

/** In-flight silent-refresh bootstraps, keyed by the shell API instance. */
const resumeInFlight = new WeakMap<ShellApi, Promise<AuthSession | null>>();

/**
 * Resume a session from the refresh cookie, sharing one request per API
 * instance while it is in flight. React StrictMode mounts the bootstrap effect
 * twice in dev; without this, every page load sent refresh/silent and me twice,
 * which also raced two rotations of the same single-use refresh cookie.
 */
export function resumeSessionOnce(api: ShellApi): Promise<AuthSession | null> {
  const pending = resumeInFlight.get(api);
  if (pending) return pending;
  const attempt = (async () => {
    const tokens = await api.authApi.refreshSilent?.();
    if (!tokens) return null;
    // `me()` needs a token in the store to authenticate; `establish()`
    // sets it again with the same value right after (idempotent).
    api.tokenStore.set(tokensFromContract(tokens));
    const user = await api.authApi.me();
    return { user, tokens };
  })();
  resumeInFlight.set(api, attempt);
  const clear = () => resumeInFlight.delete(api);
  attempt.then(clear, clear);
  return attempt;
}
