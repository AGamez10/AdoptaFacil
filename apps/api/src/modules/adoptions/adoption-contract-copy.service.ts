import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type {
  AdoptionContractPayload,
  AdoptionContractSigner,
  AdoptionSignerRole,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { AuditService } from '../../core/audit/audit.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import { PrismaService } from '../../prisma/prisma.service';
import { computeContractHash } from './adoption-contract-hash';
import {
  buildContractAttachmentName,
  buildContractCopyHtml,
  buildContractCopySubject,
  buildContractCopyText,
  buildContractLink,
} from './adoption-contract-email';
import { AdoptionContractsService } from './adoption-contracts.service';
import { CONTRACT_COPY_JOB, FOLLOWUP_QUEUE } from './followup.constants';

/** How each signer is named in the branded email (`{{rol}}`). */
const SIGNER_ROLE_LABELS: Record<string, string> = {
  adopter: 'adoptante',
  co_adopter: 'coadoptante',
  witness: 'testigo',
  organization_representative: 'representante de la organización',
};

/** Acción de auditoría que marca "copia enviada a este firmante". Es a la vez
 *  el registro de trazabilidad y la marca de idempotencia. */
export const CONTRACT_COPY_SENT_ACTION = 'adoption.contract.copy_sent';

export interface ContractCopyJobData {
  organizationId: string;
  contractId: string;
}

export interface ContractCopyResult {
  sent: number;
  alreadySent: number;
  /** Motivo si no se envió nada por una condición del contrato. */
  skipped?: 'not_found' | 'not_signed' | 'hash_mismatch';
}

interface Recipient {
  signerIds: string[];
  role: AdoptionSignerRole;
  fullName: string;
  email: string;
}

/**
 * Envía la copia en PDF del contrato de adopción, ya firmado por todas las
 * partes, al correo de cada firmante (organización, adoptante y, si los hay,
 * responsable firmante o testigos), para que cada parte conserve su ejemplar
 * además del que queda en AdoptaFácil.
 *
 * Garantías:
 * - **Idempotente, como máximo una vez por firmante.** Dentro de una
 *   transacción con candado consultivo por contrato se leen las marcas
 *   `adoption.contract.copy_sent` ya existentes y se insertan las de los
 *   firmantes pendientes ANTES de enviar. Reintentos del trabajo, dos workers
 *   a la vez o una llamada manual repetida no duplican correos. Además el
 *   trabajo en cola usa un id determinista por contrato.
 * - **Sin fuga entre organizaciones.** El trabajo solo lleva
 *   `{organizationId, contractId}`; el contrato se lee con RLS dentro de esa
 *   organización y se exige que le pertenezca. Los destinatarios salen
 *   únicamente de los firmantes de ESE contrato.
 * - **Solo contratos sellados e íntegros.** Si el estado no es `signed` o la
 *   huella guardada no coincide con el contenido, no se envía nada.
 * - **Sin datos personales en auditoría ni logs:** solo id y rol del firmante.
 */
@Injectable()
export class AdoptionContractCopyService {
  private readonly logger = new Logger(AdoptionContractCopyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(FOLLOWUP_QUEUE) private readonly queue: Queue,
    @Inject(forwardRef(() => AdoptionContractsService))
    private readonly contracts: AdoptionContractsService,
  ) {}

  /**
   * Programa el envío tras el sellado. En pruebas se ejecuta en línea (las
   * pruebas de integración no levantan worker). Si la cola no está disponible
   * se envía en línea igualmente: la idempotencia está en `dispatch`, no en la
   * cola. Nunca lanza: firmar el contrato no puede fallar por el correo.
   */
  async schedule(organizationId: string, contractId: string): Promise<void> {
    const data: ContractCopyJobData = { organizationId, contractId };
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') {
      await this.dispatch(organizationId, contractId).catch((error: Error) =>
        this.logger.warn(`contract copy dispatch failed (${error.message})`),
      );
      return;
    }
    try {
      await this.queue.add(CONTRACT_COPY_JOB, data, {
        jobId: `contract-copy-${contractId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 30 * 24 * 3600 },
        removeOnFail: { age: 30 * 24 * 3600 },
      });
    } catch (error) {
      this.logger.warn(
        `contract copy enqueue failed, sending inline (${(error as Error).message})`,
      );
      void this.dispatch(organizationId, contractId).catch((e: Error) =>
        this.logger.warn(`contract copy dispatch failed (${e.message})`),
      );
    }
  }

  /** Envía las copias pendientes de un contrato sellado. Seguro de repetir. */
  async dispatch(organizationId: string, contractId: string): Promise<ContractCopyResult> {
    const claim = await this.prisma.withOrgContext(organizationId, async (tx) => {
      // Serializa envíos concurrentes del MISMO contrato (otros contratos no
      // esperan). El candado se libera solo al terminar la transacción.
      const lockKey = `adoption-contract-copy:${contractId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const row = await tx.adoptionContract.findUnique({ where: { id: contractId } });
      if (!row || row.organizationId !== organizationId) {
        return { skipped: 'not_found' as const };
      }
      if (row.status !== 'signed' || !row.contentHash || !row.signedAt) {
        return { skipped: 'not_signed' as const };
      }
      const payload = row.payload as unknown as AdoptionContractPayload;
      if (computeContractHash(payload) !== row.contentHash) {
        await this.audit.recordWithTx(tx, {
          organizationId,
          action: 'adoption.contract.copy_blocked',
          entityType: 'adoption_contract',
          entityId: contractId,
          metadata: { reason: 'hash_mismatch' },
        });
        return { skipped: 'hash_mismatch' as const };
      }

      const previous = await tx.auditLog.findMany({
        where: {
          organizationId,
          entityType: 'adoption_contract',
          entityId: contractId,
          action: CONTRACT_COPY_SENT_ACTION,
        },
        select: { metadata: true },
      });
      const done = new Set(
        previous
          .map((p) => (p.metadata as { signerId?: unknown } | null)?.signerId)
          .filter((id): id is string => typeof id === 'string'),
      );

      const signers = row.signers as unknown as AdoptionContractSigner[];
      const byEmail = new Map<string, Recipient>();
      let alreadySent = 0;
      for (const signer of signers) {
        if (done.has(signer.id)) {
          alreadySent += 1;
          continue;
        }
        const email = signer.email?.trim().toLowerCase();
        if (!email || !email.includes('@')) continue;
        const existing = byEmail.get(email);
        if (existing) {
          existing.signerIds.push(signer.id);
        } else {
          byEmail.set(email, {
            signerIds: [signer.id],
            role: signer.role,
            fullName: signer.fullName,
            email,
          });
        }
      }
      const recipients = [...byEmail.values()];
      // Marca ANTES de enviar: como máximo una vez por firmante.
      for (const recipient of recipients) {
        for (const signerId of recipient.signerIds) {
          await this.audit.recordWithTx(tx, {
            organizationId,
            action: CONTRACT_COPY_SENT_ACTION,
            entityType: 'adoption_contract',
            entityId: contractId,
            metadata: {
              signerId,
              role: signers.find((s) => s.id === signerId)?.role ?? null,
            },
          });
        }
      }

      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      });
      return {
        recipients,
        alreadySent,
        contract: {
          id: row.id,
          payload,
          signers,
          contentHash: row.contentHash,
          signedAt: row.signedAt.toISOString(),
        },
        organizationName: payload.data.organizationName || organization?.name || 'La organización',
      };
    });

    if ('skipped' in claim) {
      return { sent: 0, alreadySent: 0, skipped: claim.skipped };
    }
    if (claim.recipients.length === 0) {
      return { sent: 0, alreadySent: claim.alreadySent };
    }

    const pdf = await this.contracts.renderPdfFor(organizationId, {
      id: claim.contract.id,
      status: 'signed',
      payload: claim.contract.payload,
      signers: claim.contract.signers,
      contentHash: claim.contract.contentHash,
    });
    const webBaseUrl = this.config.get('WEB_BASE_URL', { infer: true }) as string;
    const animalName = claim.contract.payload.animal.name;
    const filename = buildContractAttachmentName(animalName, claim.contract.id);

    for (const recipient of claim.recipients) {
      const emailInput = {
        recipientName: recipient.fullName,
        recipientRole: recipient.role,
        organizationName: claim.organizationName,
        animalName,
        contractId: claim.contract.id,
        contentHash: claim.contract.contentHash,
        signedAt: claim.contract.signedAt,
        webBaseUrl,
      };
      await this.notifications.send({
        to: recipient.email,
        // One copy per signer, even if this job is retried.
        idempotencyKey: `adoption.contract_signed:${claim.contract.id}:${recipient.email.toLowerCase()}`,
        // Branded, superadmin-editable copy; the subject/body/html below are
        // the fallback if the template can't be rendered.
        template: {
          event: 'adoption.contract_signed',
          organizationName: claim.organizationName,
          data: {
            nombre: recipient.fullName,
            animal: animalName,
            organizacion: claim.organizationName,
            fecha: claim.contract.signedAt,
            enlace: buildContractLink(webBaseUrl, claim.contract.id),
            rol: SIGNER_ROLE_LABELS[recipient.role] ?? 'firmante',
            huella: claim.contract.contentHash,
          },
        },
        subject: buildContractCopySubject(emailInput),
        body: buildContractCopyText(emailInput),
        html: buildContractCopyHtml(emailInput),
        attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
      });
    }
    return { sent: claim.recipients.length, alreadySent: claim.alreadySent };
  }
}
