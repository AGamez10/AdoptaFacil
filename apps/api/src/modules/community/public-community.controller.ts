import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PublicCommunityPost, PublicCommunityPostsPage } from '@adoptafacil/contracts';
import { RequireFeature } from '../../core/features';
import { PublicCache } from '../../core/cache/public-cache.decorator';
import { PublicCommunityService } from './public-community.service';
import { buildShareHtml, renderShareCard, shareSource } from './share/share-card';

/** Ruta de la publicación en la web (canónica, la que se indexa). */
export function publicPostPath(id: string): string {
  return `/comunidad/publicacion/${id}`;
}

/**
 * Comunidad PÚBLICA (sin sesión) y su puente para redes sociales. Mismo
 * interruptor que el muro (`community` + `communityWall`): apagado, todo 404.
 *   GET public/community/posts            → últimas publicaciones compartibles
 *   GET public/community/posts/:id        → una publicación compartible
 *   GET public/community/posts/:id/card.png → tarjeta 1200×630 para og:image
 *   GET public/share/c/:id?s=<red>        → HTML con Open Graph + redirección
 *                                            a la web con parámetros UTM
 * (Caddy publica el puente como `/c/:id` en el dominio principal.)
 */
@RequireFeature('community', 'communityWall')
@Controller('public')
export class PublicCommunityController {
  private readonly webBaseUrl: string;
  private readonly apiPublicBaseUrl: string;

  constructor(
    private readonly service: PublicCommunityService,
    config: ConfigService,
  ) {
    this.webBaseUrl = String(config.get('WEB_BASE_URL') ?? 'http://localhost:5173').replace(
      /\/+$/,
      '',
    );
    this.apiPublicBaseUrl = String(
      config.get('STORAGE_PUBLIC_BASE_URL') ?? 'http://localhost:3000',
    ).replace(/\/+$/, '');
  }

  @Get('community/posts')
  @PublicCache()
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PublicCommunityPostsPage> {
    return this.service.list(Number(limit), Number(offset));
  }

  @Get('community/posts/:id')
  @PublicCache()
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<PublicCommunityPost> {
    const post = await this.service.get(id);
    if (!post) throw new NotFoundException('Publicación no encontrada');
    return post;
  }

  @Get('community/posts/:id/card.png')
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  async card(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const post = await this.service.get(id);
    if (!post) throw new NotFoundException('Publicación no encontrada');
    const png = await renderShareCard(post, new URL(this.webBaseUrl).host.replace(/^www\./, ''));
    return new StreamableFile(png, { type: 'image/png', length: png.length });
  }

  @Get('share/c/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=600')
  // El puente solo lleva metadatos y un enlace: sin scripts ni recursos externos.
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self' https:; style-src 'unsafe-inline'",
  )
  async share(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('s') source?: string,
  ): Promise<string> {
    const post = await this.service.get(id);
    if (!post) throw new NotFoundException('Publicación no encontrada');
    const canonicalUrl = `${this.webBaseUrl}${publicPostPath(id)}`;
    const params = new URLSearchParams({
      utm_source: shareSource(source),
      utm_medium: 'social',
      utm_campaign: 'comunidad_compartida',
      utm_content: id,
    });
    return buildShareHtml({
      post,
      canonicalUrl,
      targetUrl: `${canonicalUrl}?${params.toString()}`,
      imageUrl: `${this.apiPublicBaseUrl}/public/community/posts/${id}/card.png`,
    });
  }
}
