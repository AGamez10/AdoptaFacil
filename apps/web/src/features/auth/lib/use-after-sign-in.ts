import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient } from '../../../shell/api';
import {
  clearPendingIntent,
  intentLabelFor,
  markWelcome,
  peekPendingIntent,
  savePendingIntent,
  takePendingIntent,
} from '../../../shell/auth';
import { landingAfterSignIn } from '../../org/lib/portal-readiness';

export interface AfterSignInOptions {
  /** Ruta pedida explícitamente (`?returnTo=` o `state.from`), ya validada. */
  target: string | null;
  /** `state` de esa ruta (lo que la persona ya había elegido). */
  targetState?: unknown;
}

/**
 * Adónde llevar a la persona después de entrar o crear su cuenta, por
 * cualquier puerta (correo y contraseña, Google, registro).
 *
 * 1. La ruta pedida en esta pantalla (`?returnTo=` o `state.from`).
 * 2. Si no hay, la intención guardada en esta pestaña (sobrevive a una
 *    recarga, al ir y volver entre "Iniciar sesión" y "Crear cuenta", o a la
 *    ventana de Google).
 * 3. Si tampoco, el inicio que le corresponde a su cuenta.
 *
 * Al abrir la pantalla, la ruta pedida se guarda como intención. Al terminar
 * se deja un aviso de una sola vez: bienvenida si la cuenta es nueva y, si
 * venía a hacer algo, en qué seguimos.
 */
export function useAfterSignIn({ target, targetState }: AfterSignInOptions) {
  const navigate = useNavigate();
  const client = useApiClient();

  useEffect(() => {
    if (target) savePendingIntent({ to: target, state: targetState });
  }, [target, targetState]);

  /** La intención vigente (para mostrar "Para donar a…, entra o crea tu cuenta"). */
  const intentPath = target ?? peekPendingIntent()?.to ?? null;

  const finish = useCallback(
    async (options: { isNewAccount?: boolean } = {}) => {
      const stored = takePendingIntent();
      const intent = target ? { to: target, state: targetState } : stored;
      clearPendingIntent();
      const to = intent?.to ?? (await landingAfterSignIn(client));
      const intentLabel = intent ? intentLabelFor(intent.to) : null;
      if (options.isNewAccount || intentLabel) {
        markWelcome({ isNew: options.isNewAccount === true, intentLabel });
      }
      navigate(to, { replace: true, state: intent?.state });
    },
    [target, targetState, client, navigate],
  );

  return { finish, intentPath, intentLabel: intentLabelFor(intentPath) };
}
