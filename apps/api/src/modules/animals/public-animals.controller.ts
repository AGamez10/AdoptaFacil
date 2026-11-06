import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { AnimalSummary, AnimalSummaryPage, PublicAnimalsPage } from '@adoptafacil/contracts';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { PublicAnimalsService } from './public-animals.service';
import {
  type PublicAnimalParams,
  type PublicAnimalsGlobalQuery,
  type PublicAnimalsQuery,
  publicAnimalParamsSchema,
  publicAnimalsGlobalQuerySchema,
  publicAnimalsQuerySchema,
} from './public-animals.schemas';
import { PublicCache } from '../../core/cache/public-cache.decorator';

/**
 * PUBLIC adoption catalog (T-029, RF07). No authentication: exposes only the
 * ADOPTABLE animals (is_active + status=available) of ONE organization, looked up
 * by its public portal slug, through a bounded SECURITY DEFINER function — never
 * the clinical record, reminders, documents, or another org's data. Mandatory,
 * server-capped pagination; optional species filter. Mirrors the public
 * `GET /public/organizations/:slug` endpoint.
 */
@Controller()
export class PublicAnimalsController {
  constructor(private readonly service: PublicAnimalsService) {}

  @Get('public/organizations/:slug/animals')
  @PublicCache()
  async list(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(publicAnimalsQuerySchema)) query: PublicAnimalsQuery,
  ): Promise<AnimalSummaryPage> {
    const page = await this.service.listAdoptable(slug, query);
    if (!page) {
      throw new NotFoundException('Organization not found');
    }
    return page;
  }

  /** ONE adoptable animal (public animal page), by public code or legacy id.
   *  Replaces the web's old "search the first 50 catalog rows" lookup, which
   *  left animals past the 50th unreachable. Same 404 for every non-public case. */
  @Get('public/organizations/:slug/animals/:ref')
  async detail(
    @Param(new ZodValidationPipe(publicAnimalParamsSchema)) params: PublicAnimalParams,
  ): Promise<AnimalSummary> {
    const animal = await this.service.findAdoptable(params.slug, params.ref);
    if (!animal) {
      throw new NotFoundException('Animal not found');
    }
    return animal;
  }

  /** GLOBAL adoptable catalog across every public org (S1-07), for the public
   *  landing page's portfolio view. See `PublicAnimalsService.listAllAdoptable`
   *  for how this stays RLS-safe without a new SQL function. */
  @Get('public/animals')
  @PublicCache()
  async listAll(
    @Query(new ZodValidationPipe(publicAnimalsGlobalQuerySchema)) query: PublicAnimalsGlobalQuery,
  ): Promise<PublicAnimalsPage> {
    return this.service.listAllAdoptable(query);
  }
}
