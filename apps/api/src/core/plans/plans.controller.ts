import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  Role,
  type AssignOrganizationPlanInput,
  type OrganizationPlanView,
  type OrganizationSubscription,
  type PlanCheckoutStatusView,
  type PlanCheckoutView,
  type StartPlanCheckoutInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../auth/zod-validation.pipe';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import {
  assignPlanSchema,
  planCheckoutStatusQuerySchema,
  startPlanCheckoutSchema,
} from './plans.schemas';
import { PlansService } from './plans.service';
import { PlanBillingService, type PlanWebhookOutcome } from './plan-billing.service';

/** `GET /org/plan`: the caller's org plan, limits, usage and the catalog.
 *  Billing is an Owner/Administrator matter (deny-by-default for other roles). */
@Controller('org/plan')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Owner, Role.Administrator)
export class OrgPlanController {
  constructor(
    private readonly plans: PlansService,
    private readonly billing: PlanBillingService,
  ) {}

  @Get()
  async get(@CurrentUser() user: RequestUser): Promise<OrganizationPlanView> {
    const view = await this.plans.view(user.organizationId);
    return { ...view, onlineBilling: this.billing.onlineBillingAvailable() };
  }

  /** Where a plan payment stands when the payer comes back from Mercado Pago. */
  @Get('checkout/status')
  checkoutStatus(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(planCheckoutStatusQuerySchema))
    query: { preapproval_id: string },
  ): Promise<PlanCheckoutStatusView> {
    return this.billing.checkoutStatus(user, query.preapproval_id);
  }

  /** ADR-PAG-003: pay the plan monthly with Mercado Pago (AdoptaFácil's own
   *  account). Answers the URL where the payer authorizes the charge. */
  @Post('checkout')
  @HttpCode(200)
  checkout(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(startPlanCheckoutSchema)) dto: StartPlanCheckoutInput,
  ): Promise<PlanCheckoutView> {
    return this.billing.startCheckout(user, dto.plan);
  }

  /** Stop paying: Mercado Pago stops the monthly charge and the plan keeps
   *  working until the end of the period already paid (Estatuto del
   *  Consumidor: cancelar tiene que ser tan fácil como contratar). */
  @Post('cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: RequestUser): Promise<OrganizationSubscription> {
    return this.billing.cancelOwn(user);
  }
}

/**
 * ADR-PAG-003 — Mercado Pago notifications of AdoptaFácil's OWN
 * subscriptions (PUBLIC, no JWT). Registered in the application's webhooks
 * ("Tus integraciones" → Webhooks, events "Planes y suscripciones").
 */
@Controller('billing/webhooks')
export class PlanBillingWebhookController {
  constructor(private readonly billing: PlanBillingService) {}

  @Post('mercadopago')
  @HttpCode(200)
  async mercadopago(
    @Body() payload: unknown,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: Record<string, string | undefined>,
  ): Promise<PlanWebhookOutcome> {
    try {
      return await this.billing.applyWebhook(payload, signature ?? '', {
        headers: { 'x-request-id': requestId },
        query,
      });
    } catch (error) {
      if ((error as { status?: number }).status === 404) throw error;
      throw new ForbiddenException('Webhook verification failed.');
    }
  }
}

/**
 * Platform plan management (cross-tenant, PlatformAdmin/PlatformSuperAdmin):
 * activate, extend or cancel an org's plan once its manual payment arrived.
 * Every change is audited in the TARGET org's log.
 */
@Controller('platform/organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class PlatformPlansController {
  constructor(
    private readonly plans: PlansService,
    private readonly billing: PlanBillingService,
  ) {}

  @Get(':id/plan')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<OrganizationPlanView> {
    return this.plans.platformGet(id);
  }

  @Put(':id/plan')
  assign(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignPlanSchema)) dto: AssignOrganizationPlanInput,
  ): Promise<OrganizationSubscription> {
    return this.billing.platformAssign(actor.id, id, dto);
  }
}
