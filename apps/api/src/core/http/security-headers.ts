import type { NextFunction, Request, Response } from 'express';

/**
 * Cabeceras de seguridad de TODAS las respuestas de la API (sin dependencia
 * nueva). Ninguna cambia lo que la web puede hacer con la API:
 *  - `nosniff`: un archivo subido nunca se interpreta como otro tipo (p. ej. HTML).
 *  - `X-Frame-Options: DENY`: la web nunca enmarca la API (clickjacking).
 *  - `Referrer-Policy`: no filtra rutas completas a terceros.
 *  - HSTS solo en producción: el navegador recuerda ir siempre por HTTPS. Sin
 *    `includeSubDomains` ni `preload`, para no imponerlo a dominios que no
 *    controlamos desde aquí.
 * La redirección HTTP→HTTPS la hace el borde de Render; la API no redirige (los
 * health checks internos llegan por HTTP).
 */
export function securityHeaders(production: boolean) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  };
}
