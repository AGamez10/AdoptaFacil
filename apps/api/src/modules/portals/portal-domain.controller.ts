import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  Role,
  type PortalDomainLookup,
  type PortalDomainView,
  type SetPortalDomainInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { PortalDomainService } from './portal-domain.service';
import {
  portalDomainAskQuerySchema,
  portalDomainResolveQuerySchema,
  setPortalDomainSchema,
} from './portals.schemas';

/**
 * Dominio propio del portal (panel). Owner y Administrator, los mismos roles
 * que editan el portal y pagan el plan. Deny-by-default vía RolesGuard; la
 * capacidad del plan (`customDomain`) se exige en el servicio al pedir y
 * verificar, no al leer (así la organización ve por qué no puede).
 */
@Controller('org/portal/domain')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Owner, Role.Administrator)
export class OrgPortalDomainController {
  constructor(private readonly domains: PortalDomainService) {}

  @Get()
  get(@CurrentUser() actor: RequestUser): Promise<PortalDomainView> {
    return this.domains.view(actor);
  }

  @Put()
  set(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(setPortalDomainSchema)) dto: SetPortalDomainInput,
  ): Promise<PortalDomainView> {
    return this.domains.request(actor, dto.domain);
  }

  @Post('verify')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@CurrentUser() actor: RequestUser): Promise<PortalDomainView> {
    return this.domains.verify(actor);
  }

  @Delete()
  remove(@CurrentUser() actor: RequestUser): Promise<PortalDomainView> {
    return this.domains.remove(actor);
  }
}

/**
 * PÚBLICO: qué portal se sirve en un host (la web) y si Caddy puede emitir el
 * certificado de un host (`on_demand_tls ask`, responde 200 o 404). Solo
 * dominios verificados de organizaciones cuyo plan los incluye: así nadie nos
 * hace emitir certificados para dominios ajenos.
 */
@Controller('public/portal-domains')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class PublicPortalDomainController {
  constructor(private readonly domains: PortalDomainService) {}

  @Get('resolve')
  async resolve(
    @Query(new ZodValidationPipe(portalDomainResolveQuerySchema)) query: { host: string },
  ): Promise<PortalDomainLookup> {
    const slug = await this.domains.servableSlug(query.host);
    if (!slug) throw new NotFoundException('No portal for this host');
    return { slug };
  }

  @Get('ask')
  async ask(
    @Query(new ZodValidationPipe(portalDomainAskQuerySchema)) query: { domain: string },
  ): Promise<{ ok: true }> {
    const slug = await this.domains.servableSlug(query.domain);
    if (!slug) throw new NotFoundException();
    return { ok: true };
  }
}
