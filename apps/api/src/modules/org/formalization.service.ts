import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, FormalizationTransition as TransitionRow } from '@prisma/client';
import {
  DocumentStatus,
  type DocumentType,
  FORMALIZATION_SEQUENCE,
  type FormalizationStatus,
  FormalizationState,
  type FormalizationTransition,
  type RequestFormalizationTransitionInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { DianVerificationService, parseDianVerification } from './dian-verification.service';
import { DocumentsService } from './documents.service';
import {
  PLATFORM_ONLY_STATES,
  PLATFORM_TRANSITION_EVIDENCE,
  checkTransition,
  rteVigenteFor,
} from './formalization.machine';

function toTransition(row: TransitionRow): FormalizationTransition {
  return {
    id: row.id,
    organizationId: row.organizationId,
    fromState: row.fromState as FormalizationState,
    toState: row.toState as FormalizationState,
    actorUserId: row.actorUserId,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface TransitionResult {
  status: FormalizationStatus;
  transition: FormalizationTransition;
}

/** Who drives a transition: the organization's own Owner, or a platform
 *  reviewer acting on an approved document (R2-2, SEC-003). */
type TransitionActor = { kind: 'organization' } | { kind: 'platform'; evidenceDocumentId?: string };

@Injectable()
export class FormalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
    private readonly dianVerification: DianVerificationService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Current formalization state + rteVigente (+ DIAN verification, S-2) for
   *  the caller's org. */
  async getStatus(): Promise<FormalizationStatus> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const profile = await tx.organizationProfile.findUnique({ where: { organizationId } });
      return {
        state: (profile?.formalizationState as FormalizationState) ?? FormalizationState.Informal,
        rteVigente: profile?.rteVigente ?? false,
        dianVerification: parseDianVerification(organizationId, profile?.dianVerification),
      };
    });
  }

  /** Append-only history for the caller's org, oldest first. */
  async getHistory(): Promise<FormalizationTransition[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.formalizationTransition.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return rows.map(toTransition);
  }

  /**
   * Move the caller's org one adjacent step (Owner only, enforced at the
   * controller). An organization can NEVER move itself INTO a formal state
   * that unlocks tax benefits (ESAL, ESAL_RTE): that is a platform decision
   * (403 here, see {@link platformTransition}). Moving down is still allowed.
   */
  async transition(
    actorUserId: string,
    input: RequestFormalizationTransitionInput,
  ): Promise<TransitionResult> {
    return this.applyTransition(this.requireOrgId(), actorUserId, input, { kind: 'organization' });
  }

  /**
   * Platform review (R2-2, SEC-003): a PlatformAdmin moves `organizationId`
   * one adjacent step. Entering ESAL or ESAL_RTE requires citing an evidence
   * document of THAT organization which is Approved, current (not expired, the
   * latest version of its type) and whose file exists in storage. Runs under
   * the target org's context (explicit, RBAC-gated, audited cross-tenant write
   * — same accessor the platform document review uses).
   */
  async platformTransition(
    actorUserId: string,
    organizationId: string,
    input: RequestFormalizationTransitionInput & { evidenceDocumentId?: string },
  ): Promise<TransitionResult> {
    const exists = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!exists) {
      throw new NotFoundException('Organization not found');
    }
    return this.applyTransition(organizationId, actorUserId, input, {
      kind: 'platform',
      evidenceDocumentId: input.evidenceDocumentId,
    });
  }

  private async applyTransition(
    organizationId: string,
    actorUserId: string,
    input: RequestFormalizationTransitionInput,
    actor: TransitionActor,
  ): Promise<TransitionResult> {
    const entersPlatformOnlyState = PLATFORM_ONLY_STATES.includes(input.targetState);
    if (actor.kind === 'organization' && entersPlatformOnlyState) {
      // Checked before reading anything: a downgrade (e.g. ESAL_RTE → ESAL)
      // targets a platform-only state too, so compare with the current one.
      const current = await this.prisma.withOrgContext(organizationId, (tx) =>
        tx.organizationProfile.findUnique({ where: { organizationId } }),
      );
      const from =
        (current?.formalizationState as FormalizationState) ?? FormalizationState.Informal;
      const isDowngrade =
        FORMALIZATION_SEQUENCE.indexOf(input.targetState) < FORMALIZATION_SEQUENCE.indexOf(from);
      if (!isDowngrade) {
        throw new ForbiddenException(
          'Reaching ESAL or ESAL with RTE requires review by the platform with an approved document.',
        );
      }
    }
    let shouldTriggerDianVerification = false;
    let nitForDianVerification: string | null = null;

    const result = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const profile = await tx.organizationProfile.findUnique({ where: { organizationId } });
      const from =
        (profile?.formalizationState as FormalizationState) ?? FormalizationState.Informal;

      // Parametrizable document gate (T-103): a forward step may require certain
      // documents to be Approved & current. The catalog is empty by default
      // (TODO(client) in TRANSITION_REQUIREMENTS), so this is a no-op until seeded.
      const satisfiedDocuments = await this.documents.satisfiedTypesInTx(tx, organizationId);
      // S-2 (RNF07): the ESAL_RTE gate needs a CONCRETE status here, never
      // `undefined` — otherwise the machine's "absent means ungated" default
      // (meant for pure unit tests) would silently bypass real production
      // requests. No attempt ever made yet reads the same as "pending".
      const dianStatus =
        parseDianVerification(organizationId, profile?.dianVerification)?.status ?? 'pending';
      // R2-2: on the platform path the human review of an approved document
      // replaces the automated DIAN check (there is no official DIAN API and
      // the adapter is disabled in production); the DIAN status is kept in
      // the audit trail for context.
      const check = checkTransition(from, input.targetState, {
        satisfiedDocuments,
        dianStatus: actor.kind === 'platform' ? undefined : dianStatus,
      });
      if (!check.allowed) {
        throw new BadRequestException(check.error);
      }
      const reason = input.reason?.trim() ? input.reason.trim() : undefined;
      if (check.requiresReason && !reason) {
        throw new BadRequestException(
          'A reason is required to move the formalization state backward.',
        );
      }

      let evidence: { id: string; type: string } | undefined;
      if (actor.kind === 'platform' && check.kind === 'forward' && entersPlatformOnlyState) {
        evidence = await this.requireEvidence(
          tx,
          organizationId,
          input.targetState,
          actor.evidenceDocumentId,
        );
      }

      const rteVigente = rteVigenteFor(input.targetState);
      await tx.organizationProfile.upsert({
        where: { organizationId },
        create: { organizationId, formalizationState: input.targetState, rteVigente },
        update: { formalizationState: input.targetState, rteVigente },
      });

      // S1-05: the verification level is a computed effect of formalization +
      // documents, never set directly — recompute it now that formalization
      // moved (the profile row above already exists, from this same upsert).
      await this.documents.recomputeAndPersistVerification(tx, organizationId);

      const row = await tx.formalizationTransition.create({
        data: {
          organizationId,
          fromState: from,
          toState: input.targetState,
          actorUserId,
          reason: reason ?? null,
        },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'organization.formalization_changed',
        entityType: 'organization',
        entityId: organizationId,
        metadata: {
          from,
          to: input.targetState,
          kind: check.kind,
          by: actor.kind,
          ...(evidence ? { evidenceDocumentId: evidence.id, evidenceType: evidence.type } : {}),
          ...(actor.kind === 'platform' ? { dianStatus } : {}),
        },
      });

      // S-2 (RNF07): reaching ESAL auto-triggers the DIAN RTE verification —
      // captured here (inside the tx, where `profile.nit` is already loaded)
      // but enqueued AFTER the transaction commits, same "external I/O never
      // inside the DB transaction" rule as DocumentsService/RemindersService.
      // Silently skipped with no NIT yet — that's a data-completeness gap for
      // the Owner to fix in Datos institucionales, not a reason to block
      // reaching ESAL itself (not required by the base document).
      if (input.targetState === FormalizationState.ESAL && profile?.nit) {
        shouldTriggerDianVerification = true;
        nitForDianVerification = profile.nit;
      }

      return {
        status: { state: input.targetState, rteVigente },
        transition: toTransition(row),
      };
    });

    if (shouldTriggerDianVerification && nitForDianVerification) {
      await this.dianVerification.enqueue(organizationId, nitForDianVerification, 'auto', null);
    }

    return result;
  }

  /** The evidence a platform reviewer must cite to move an org INTO a
   *  platform-only state: a document of that org, Approved, not expired, the
   *  latest version of its type, of an accepted type, with its file in storage. */
  private async requireEvidence(
    tx: Prisma.TransactionClient,
    organizationId: string,
    target: FormalizationState,
    documentId: string | undefined,
  ): Promise<{ id: string; type: string }> {
    if (!documentId) {
      throw new BadRequestException(
        `An approved evidence document (evidenceDocumentId) is required to reach "${target}".`,
      );
    }
    // RLS (target org context) + the explicit filter: a document of another
    // organization is simply "not found".
    const doc = await tx.organizationDocument.findFirst({
      where: { id: documentId, organizationId },
    });
    if (!doc) {
      throw new NotFoundException('Evidence document not found for this organization');
    }
    const accepted = PLATFORM_TRANSITION_EVIDENCE[target];
    if (accepted && !accepted.includes(doc.type as DocumentType)) {
      throw new BadRequestException(
        `Document type "${doc.type}" is not accepted as evidence for "${target}".`,
      );
    }
    const latest = await tx.organizationDocument.findFirst({
      where: { organizationId, type: doc.type },
      orderBy: { version: 'desc' },
    });
    const expired = doc.expiresAt !== null && doc.expiresAt.getTime() <= Date.now();
    if (doc.status !== DocumentStatus.Approved || expired || latest?.id !== doc.id) {
      throw new BadRequestException(
        'The evidence document must be approved, current (not expired) and its latest version.',
      );
    }
    const file = await this.storage.readObject(doc.storageRef);
    if (!file) {
      throw new BadRequestException('The evidence document file does not exist in storage.');
    }
    return { id: doc.id, type: doc.type };
  }
}
