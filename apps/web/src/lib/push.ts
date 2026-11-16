/**
 * Avisos push del navegador o de la app instalada (VAPID). Solo se activa si el
 * navegador lo soporta, la persona lo pide y la API tiene su clave pública.
 * Nada de esto es obligatorio: sin permiso, la bandeja sigue funcionando igual.
 */

export interface PushApiClient {
  request<T>(path: string, init?: { method?: string; json?: unknown }): Promise<T>;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Convierte la clave VAPID (base64url) al formato que pide `pushManager.subscribe`. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** Clave pública que expone la API; `null` si el push está apagado allí. */
export async function fetchPushPublicKey(client: PushApiClient): Promise<string | null> {
  try {
    const body = await client.request<{ publicKey: string | null }>('/me/push/config');
    return body.publicKey;
  } catch {
    return null;
  }
}

/** ¿Este navegador ya tiene una suscripción activa? */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const registration = await readyRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * Pide permiso, se suscribe y guarda la suscripción en la API. Devuelve `false`
 * si la persona no dio permiso o algo falló (la app sigue igual).
 */
export async function enablePush(client: PushApiClient, publicKey: string): Promise<boolean> {
  const registration = await readyRegistration();
  if (!registration) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  await client.request('/me/push/subscriptions', {
    method: 'POST',
    json: {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: navigator.userAgent.slice(0, 300),
    },
  });
  return true;
}

/** Quita la suscripción de este navegador (en la API y en el navegador). */
export async function disablePush(client: PushApiClient): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  try {
    await client.request('/me/push/subscriptions/remove', {
      method: 'POST',
      json: { endpoint: subscription.endpoint },
    });
  } finally {
    await subscription.unsubscribe();
  }
}
