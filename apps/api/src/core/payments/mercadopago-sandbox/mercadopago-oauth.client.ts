/**
 * Prueba de concepto (sandbox) del split 1:1 de Mercado Pago — cliente OAuth.
 *
 * Recuperado de la versión retirada en 145df93 (`core/payments/mercadopago-oauth.client.ts`)
 * y desacoplado de Nest/ConfigService: recibe su configuración explícita para
 * poder usarse desde el script de sandbox sin activar un PAYMENT_DRIVER nuevo.
 * NO está cableado al producto: ePayco sigue siendo la única pasarela.
 *
 * Transporte puro: no guarda tokens ni firma el `state` (eso es del llamador).
 * Nunca registra secretos ni tokens.
 */

export type MercadoPagoFetch = typeof fetch;

/** Host de autorización propio de Colombia (verificado en vivo en la versión anterior). */
export const MERCADOPAGO_AUTHORIZE_URL = 'https://auth.mercadopago.com.co/authorization';
export const MERCADOPAGO_API_BASE_URL = 'https://api.mercadopago.com';

export interface MercadoPagoOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl?: string;
}

/** Respuesta de `POST /oauth/token` (mismo shape para authorization_code y refresh_token). */
export interface MercadoPagoOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number | string;
  public_key?: string;
  token_type?: string;
  scope?: string;
  live_mode?: boolean;
}

/** El mensaje es solo para logs del servidor; nunca incluye el cuerpo de la respuesta. */
export class MercadoPagoOAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly mpError?: string,
  ) {
    super(message);
    this.name = 'MercadoPagoOAuthError';
  }
}

export class MercadoPagoOAuthClient {
  private readonly tokenUrl: string;

  constructor(
    private readonly config: MercadoPagoOAuthConfig,
    private readonly fetchFn: MercadoPagoFetch = globalThis.fetch.bind(globalThis),
  ) {
    if (!config.clientId || !config.clientSecret || !config.redirectUri) {
      throw new Error('MercadoPagoOAuthClient requires clientId, clientSecret and redirectUri.');
    }
    this.tokenUrl = `${(config.baseUrl ?? MERCADOPAGO_API_BASE_URL).replace(/\/$/, '')}/oauth/token`;
  }

  /**
   * URL a la que se navega el navegador del refugio. `scope=offline_access`
   * es necesario para recibir `refresh_token` (verificado en vivo antes).
   */
  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: this.config.redirectUri,
      state,
      scope: 'offline_access',
    });
    return `${MERCADOPAGO_AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Intercambia el `code` del callback por el par de tokens del vendedor. */
  exchangeCode(code: string): Promise<MercadoPagoOAuthTokenResponse> {
    return this.postToken({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
    });
  }

  /** Renueva el par de tokens antes de que venza (~180 días). */
  refreshToken(refreshToken: string): Promise<MercadoPagoOAuthTokenResponse> {
    return this.postToken({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  private async postToken(body: Record<string, string>): Promise<MercadoPagoOAuthTokenResponse> {
    const response = await this.fetchFn(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      // Solo el código de error de MP (p. ej. "invalid_grant"), nunca el cuerpo
      // completo: puede reflejar parámetros de la petición.
      const parsed = (await response.json().catch(() => ({}))) as { error?: unknown };
      const mpError = typeof parsed.error === 'string' ? parsed.error : undefined;
      throw new MercadoPagoOAuthError(
        `MercadoPago OAuth token exchange failed (grant_type=${body.grant_type}, status=${response.status}${mpError ? `, error=${mpError}` : ''})`,
        response.status,
        mpError,
      );
    }
    return (await response.json()) as MercadoPagoOAuthTokenResponse;
  }
}
