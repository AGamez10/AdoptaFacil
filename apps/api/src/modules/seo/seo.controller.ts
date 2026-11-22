import { Controller, Get, Header } from '@nestjs/common';
import { SeoSitemapService } from './seo.service';

/**
 * Sitemap dinámico para buscadores, sin sesión. Lo enlaza el `robots.txt`
 * de la web (`Sitemap: <sitio>/api/public/seo/sitemap.xml`). Solo URLs
 * públicas: fichas de animales adoptables, portales, ciudades y campañas
 * activas; nunca páginas privadas ni datos de personas.
 */
@Controller('public/seo')
export class SeoController {
  constructor(private readonly sitemap: SeoSitemapService) {}

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600')
  @Header('X-Robots-Tag', 'noindex')
  sitemapXml(): Promise<string> {
    return this.sitemap.sitemapXml();
  }
}
