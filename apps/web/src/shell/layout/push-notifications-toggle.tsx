import { useEffect, useState } from 'react';
import { Button } from '@adoptafacil/ui';
import { useApiClient } from '../api';
import { useSession } from '../auth';
import {
  currentPushSubscription,
  disablePush,
  enablePush,
  fetchPushPublicKey,
  isPushSupported,
} from '../../lib/push';

/**
 * Interruptor "Avisos al celular" del encabezado. Solo aparece si el navegador
 * soporta push, la API tiene clave VAPID y hay sesión. Sin permiso o sin clave,
 * no ocupa lugar: la bandeja de avisos sigue igual.
 */
export function PushNotificationsToggle() {
  const client = useApiClient();
  const { isAuthenticated } = useSession();
  const enabledSession = isAuthenticated;
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabledSession || !isPushSupported()) return;
    let active = true;
    void (async () => {
      const key = await fetchPushPublicKey(client);
      const current = key ? await currentPushSubscription() : null;
      if (!active) return;
      setPublicKey(key);
      setSubscribed(Boolean(current));
    })();
    return () => {
      active = false;
    };
  }, [client, enabledSession]);

  if (!enabledSession || !publicKey) return null;

  const toggle = async (): Promise<void> => {
    setBusy(true);
    try {
      if (subscribed) {
        await disablePush(client);
        setSubscribed(false);
      } else {
        setSubscribed(await enablePush(client, publicKey));
      }
    } catch {
      // Sin aviso ruidoso: si falla, el estado queda como estaba.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() => void toggle()}
      aria-pressed={subscribed}
    >
      {subscribed ? 'Avisos al celular: activados' : 'Activar avisos al celular'}
    </Button>
  );
}
