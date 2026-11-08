/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Google OAuth 2.0 Client ID (T-Google-SignIn). Empty/unset in dev renders
   *  a "Continuar con Google (prueba)" button against the FakeIdentityAdapter
   *  instead of loading the real Google Identity Services script. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Interruptor de pagos en línea: `off`/`none`/`disabled` esconden el pago
   *  en línea. Cualquier otro valor (o sin definir) deja que la API decida.
   *  Ver features/payments/lib/payment-provider.ts. */
  readonly VITE_PAYMENT_PROVIDER?: string;
  /** Planes y suscripciones: where a shelter asks for a paid plan while billing
   *  is manual (WhatsApp or form of AdoptaFácil). Unset → the plans screen says
   *  the change will be available soon. `?plan=<key>` is appended. */
  readonly VITE_BILLING_CONTACT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
