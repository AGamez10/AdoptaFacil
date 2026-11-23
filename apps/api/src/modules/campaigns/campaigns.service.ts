import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Campaign as CampaignRow } from '@prisma/client';
import {
  type Campaign,
  type CampaignCategory,
  type CampaignStatus,
  type CreateCampaignInput,
  DATE_RULES,
  dateRuleError,
  type Paginated,
  type UpdateCampaignInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { campaignChanges, campaignLockProblem } from './campaign-lock';
import { computeProgress } from './campaign-progress';

const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category as CampaignCategory,
    goalAmount: row.goalAmount,
    raisedAmount: row.raisedAmount,
    progress: computeProgress(row.raisedAmount, row.goalAmount),
    deadline: row.deadline.toISOString(),
    status: row.status as CampaignStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Clamp a requested page size to [1, MAX_PAGE]. */
export function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE);
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Create a campaign (active, raised 0); audited. */
  async create(actorUserId: string, input: CreateCampaignInput): Promise<Campaign> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.campaign.create({
        data: {
          organizationId,
          title: input.title,
          description: input.description ?? null,
          category: input.category,
          goalAmount: input.goalAmount,
          deadline: new Date(input.deadline),
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'campaign.created',
        entityType: 'campaign',
        entityId: row.id,
        metadata: { category: input.category },
      });
      return toCampaign(row);
    });
  }

  /** Paginated list of the caller's org campaigns, newest first. */
  async list(limit: number, offset: number): Promise<Paginated<Campaign>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.campaign.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        tx.campaign.count({ where: { organizationId } }),
      ]);
      return { items: rows.map(toCampaign), total, limit: take, offset: skip };
    });
  }

  /** One campaign of the caller's org. */
  async get(id: string): Promise<Campaign> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.campaign.findUnique({ where: { id } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Campaign not found');
    }
    return toCampaign(row);
  }

  /**
   * Patch a campaign. A closed or cancelled campaign is final (never reopened
   * or rewritten) and, once it received money, its goal cannot go down nor its
   * category change (409; the DB trigger `campaigns_lock` enforces the same).
   * The audit records each changed field with its previous and new value.
   */
  async update(actorUserId: string, id: string, input: UpdateCampaignInput): Promise<Campaign> {
    const organizationId = this.requireOrgId();
    const result = await this.prisma.withOrgContext(organizationId, async (tx) => {
      // FOR UPDATE: a donation landing at the same time waits for this edit,
      // so the "already received money" check cannot race the first donation.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM campaigns WHERE id = ${id}::uuid FOR UPDATE`;
      const existing = locked.length ? await tx.campaign.findUnique({ where: { id } }) : null;
      if (!existing) {
        throw new NotFoundException('Campaign not found');
      }
      const changes = campaignChanges(existing, input);
      const problem = campaignLockProblem(existing, changes);
      if (problem) {
        return { rejected: { problem, status: existing.status, fields: Object.keys(changes) } };
      }
      if (Object.keys(changes).length === 0) {
        return { campaign: toCampaign(existing) };
      }
      // Una fecha límite NUEVA no puede quedar en el pasado; reenviar la que ya
      // estaba guardada (al editar otros campos) sí se permite.
      if (changes.deadline && input.deadline) {
        const error = dateRuleError(input.deadline, DATE_RULES.campaignDeadline);
        if (error) throw new BadRequestException(error);
      }
      const updated = await tx.campaign.update({
        where: { id },
        data: {
          title: changes.title ? input.title : undefined,
          description: changes.description ? input.description : undefined,
          category: changes.category ? input.category : undefined,
          goalAmount: changes.goalAmount ? input.goalAmount : undefined,
          status: changes.status ? input.status : undefined,
          deadline: changes.deadline && input.deadline ? new Date(input.deadline) : undefined,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: changes.status ? 'campaign.status_changed' : 'campaign.updated',
        entityType: 'campaign',
        entityId: id,
        metadata: {
          ...(changes.status ? { from: changes.status.from, to: changes.status.to } : {}),
          fields: Object.keys(changes),
          changes,
          raisedAmount: existing.raisedAmount,
        },
      });
      return { campaign: toCampaign(updated) };
    });
    if ('rejected' in result && result.rejected) {
      // Outside the (read-only) transaction so the attempt stays on the log.
      await this.audit.record({
        organizationId,
        actorUserId,
        action: 'campaign.locked_change_rejected',
        entityType: 'campaign',
        entityId: id,
        metadata: { status: result.rejected.status, fields: result.rejected.fields },
      });
      throw new ConflictException(result.rejected.problem);
    }
    return result.campaign as Campaign;
  }
}
