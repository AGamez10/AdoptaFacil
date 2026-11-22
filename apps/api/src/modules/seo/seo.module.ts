import { Module } from '@nestjs/common';
import { AnimalsModule } from '../animals/animals.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { SeoController } from './seo.controller';
import { SeoSitemapService } from './seo.service';

/** SEO del lado del servidor: el sitemap dinámico (ver `seo.service.ts`). */
@Module({
  imports: [AnimalsModule, CampaignsModule],
  controllers: [SeoController],
  providers: [SeoSitemapService],
})
export class SeoModule {}
