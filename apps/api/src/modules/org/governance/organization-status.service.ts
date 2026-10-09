import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Organization } from '@prisma/client';
import {
  type ChangeOrganizationStatusInput,
  ORGANIZATION_STATUS_TRANSITIONS,
  ORGANIZATION_SUBMITTABLE_STATUSES,
  OrganizationStatus,
  type OrganizationStatusView,
  type PlatformOrganizationListItem,
} from '@adoptafacil/contracts';
import { AuditService } from '../../../core/audit/audit.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { PrismaService } from '../../../prisma/prisma.service';

/** Targets that must carry a reason the organization can read. */
const REASON_REQUIRED: readonly OrganizationStatus[] = [
  OrganizationStatus.Observed,
  OrganizationStatus.Rejected,
  OrganizationStatus.Suspended,
];

type StatusRow = Pick<Organization, 'id' | 'status' | 'statusReason' | 'statusChangedAt'>;

function toView(row: StatusRow): OrganizationStatusView {
  return {
    organizationId: row.id,
    status: row.status as OrganizationStatus,
    reason: row.statusReason,
    changedAt: row.statusChangedAt?.toISOString() ?? null,
  };
}

/**
 * Operational status of an organization (R2-1, AF-023, MVP-RF-07). The Owner
 * submits it for review; every other change is the platform's. Only `approved` organizations are public (enforced in the public
 * SECURITY DEFINER functions) and `suspended` blocks the backoffice (enforced
 * in JwtAuthGuard).
 */
@Injectable()
export class OrganizationStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  /** `GET /org/status`: the caller's own organization. */
  async getOwn(): Promise<OrganizationStatusView> {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    const row = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!row) {
      throw new NotFoundException('Organization not found');
    }
    return toView(row);
  }

  /**
   * `GET /platform/organizations`: the review queue. Lists only real
   * organizations (an `organization` account exists in them), never the
   * personal organization of a person or of a platform admin. Oldest first.
   */
  async list(status?: OrganizationStatus): Promise<PlatformOrganizationListItem[]> {
    const rows = await this.prisma.$queryRaw<Array<StatusRow & { name: string; createdAt: Date }>>`
      SELECT o.id, o.name, o.status, o.status_reason AS "statusReason",
             o.status_changed_at AS "statusChangedAt", o.created_at AS "createdAt"
      FROM organizations o
      WHERE EXISTS (
        SELECT 1 FROM auth_credentials c
        WHERE c.organization_id = o.id AND c.account_type = 'organization'
      )
      AND (${status ?? null}::text IS NULL OR o.status = ${status ?? null}::text)
      ORDER BY o.created_at ASC
      LIMIT 500
    `;
    return rows.map((row) => ({
      ...toView(row),
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * `POST /org/status/submit` (Owner): send the caller's own organization to
   * platform review, from draft or observed. What must be complete before
   * submitting is not fixed by the base document: TODO(client) (no gate yet).
   */
  async submit(actorUserId: string): Promise<OrganizationStatusView> {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    const current = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!current) {
      throw new NotFoundException('Organization not found');
    }
    const from = current.status as OrganizationStatus;
    if (!ORGANIZATION_SUBMITTABLE_STATUSES.includes(from)) {
      throw new ConflictException(`An organization in "${from}" cannot be submitted for review.`);
    }
    return this.apply(
      actorUserId,
      organizationId,
      from,
      OrganizationStatus.PendingReview,
      null,
      'organization',
    );
  }

  /**
   * `POST /platform/organizations/:organizationId/status`. Follows
   * ORGANIZATION_STATUS_TRANSITIONS and requires a reason for observed/
   * rejected/suspended. Audited in the TARGET organization's trail.
   */
  async change(
    actorUserId: string,
    organizationId: string,
    input: ChangeOrganizationStatusInput,
  ): Promise<OrganizationStatusView> {
    const current = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!current) {
      throw new NotFoundException('Organization not found');
    }
    const from = current.status as OrganizationStatus;
    if (!ORGANIZATION_STATUS_TRANSITIONS[from]?.includes(input.status)) {
      throw new BadRequestException(
        `Cannot move an organization from "${from}" to "${input.status}".`,
      );
    }
    const reason = input.reason?.trim() || null;
    if (REASON_REQUIRED.includes(input.status) && !reason) {
      throw new BadRequestException(
        `A reason is required to move an organization to "${input.status}".`,
      );
    }
    return this.apply(actorUserId, organizationId, from, input.status, reason, 'platform');
  }

  /** Conditional update on the status read before (a concurrent change makes
   *  the loser 409) plus the audit entry, in one transaction. */
  private apply(
    actorUserId: string,
    organizationId: string,
    from: OrganizationStatus,
    to: OrganizationStatus,
    reason: string | null,
    by: 'organization' | 'platform',
  ): Promise<OrganizationStatusView> {
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const now = new Date();
      const updated = await tx.organization.updateMany({
        where: { id: organizationId, status: from },
        data: {
          status: to,
          statusReason: reason,
          statusChangedAt: now,
          statusChangedByUserId: actorUserId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('The organization status changed meanwhile; reload and retry.');
      }
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'organization.status_changed',
        entityType: 'organization',
        entityId: organizationId,
        metadata: { from, to, reason, by },
      });
      return toView({ id: organizationId, status: to, statusReason: reason, statusChangedAt: now });
    });
  }
}
