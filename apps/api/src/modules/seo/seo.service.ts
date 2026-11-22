import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignStatus } from '@adoptafacil/contracts';
import { PublicAnimalsService } from '../animals/public-animals.service';
import { PublicCampaignsService } from '../campaigns/public-campaigns.service';
import {
  renderSitemap,
  sitemapEntries,
  type SitemapAnimal,
  type SitemapCampaign,
} from './sitemap.builder';

/** Tope de animales por sitemap (50 por página → 200 lecturas como máximo).
 *  Google acepta 50.000 URLs por archivo; al acercarse, partir por tipo. */
export const SITEMAP_MAX_ANIMALS = 10_000;
const PAGE = 50;
/** El sitemap se arma como mucho cada 30 minutos por instancia. */
const TTL_MS = 30 * 60 * 1000;

/**
 * Sitemap dinámico (SEO): las fichas, portales, ciudades y campañas que existen
 * AHORA, no las que había cuando se construyó la web. Solo lee las mismas
 * funciones públicas acotadas (SECURITY DEFINER) que el catálogo y las
 * campañas públicas: nada que no sea ya visible sin sesión.
 */
@Injectable()
export class SeoSitemapService {
  private readonly logger = new Logger(SeoSitemapService.name);
  private readonly webBaseUrl: string;
  private cache: { xml: string; at: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(
    private readonly animals: PublicAnimalsService,
    private readonly campaigns: PublicCampaignsService,
    config: ConfigService,
  ) {
    this.webBaseUrl = String(config.get('WEB_BASE_URL') ?? 'http://localhost:5173').replace(
      /\/+$/,
      '',
    );
  }

  async sitemapXml(now = Date.now()): Promise<string> {
    if (this.cache && now - this.cache.at < TTL_MS) return this.cache.xml;
    // Una sola construcción a la vez aunque lleguen varios rastreadores juntos.
    this.pending ??= this.build()
      .then((xml) => {
        this.cache = { xml, at: Date.now() };
        return xml;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  private async build(): Promise<string> {
    const [animals, campaigns] = await Promise.all([this.allAnimals(), this.activeCampaigns()]);
    return renderSitemap(this.webBaseUrl, sitemapEntries(animals, campaigns));
  }

  private async allAnimals(): Promise<SitemapAnimal[]> {
    const all: SitemapAnimal[] = [];
    let cursor: string | undefined;
    while (all.length < SITEMAP_MAX_ANIMALS) {
      const page = await this.animals.listAllAdoptable({ limit: PAGE, cursor });
      for (const item of page.data) {
        if (!item.organization?.slug) continue;
        all.push({
          id: item.id,
          name: item.name,
          species: item.species as SitemapAnimal['species'],
          publicCode: item.publicCode,
          photoUrl: item.photoUrl,
          createdAt: String(item.createdAt ?? ''),
          organization: { slug: item.organization.slug, city: item.organization.city },
        });
      }
      if (!page.nextCursor || page.data.length < PAGE) break;
      cursor = page.nextCursor;
    }
    if (all.length >= SITEMAP_MAX_ANIMALS) {
      this.logger.warn(`Sitemap recortado en ${SITEMAP_MAX_ANIMALS} animales: partirlo por tipo.`);
    }
    return all;
  }

  private async activeCampaigns(): Promise<SitemapCampaign[]> {
    const all: SitemapCampaign[] = [];
    for (let offset = 0; offset < 2_000; offset += PAGE) {
      const page = await this.campaigns.list(PAGE, offset);
      for (const campaign of page.items) {
        if (campaign.status === CampaignStatus.Active) {
          all.push({ id: campaign.id, createdAt: campaign.createdAt });
        }
      }
      if (page.items.length < PAGE || offset + PAGE >= page.total) break;
    }
    return all;
  }
}
