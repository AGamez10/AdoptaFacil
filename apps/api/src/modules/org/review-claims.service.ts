import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { DocumentReviewClaim } from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { REDIS_CLIENT } from '../../redis/redis.service';

/** Cuánto dura una reserva sin renovarse. Un revisor que se va deja el
 *  expediente libre solo, sin que nadie tenga que "soltarlo". */
export const REVIEW_CLAIM_TTL_MS = 30 * 60 * 1000;

const KEY_PREFIX = 'review-claim:org:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Borra la clave solo si sigue siendo del mismo revisor (atómico). */
const RELEASE_IF_OWNER = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local ok, claim = pcall(cjson.decode, current)
if ok and claim.reviewerUserId == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
end
return -1
`;

export interface ReviewClaimActor {
  id: string;
  email: string;
  /** PlatformSuperAdmin puede liberar la reserva de otro revisor. */
  canOverride: boolean;
  /** Equipo (organización) del revisor: los demás equipos no ven quién es. */
  teamOrganizationId: string;
}

/** Lo que se guarda en Redis: la reserva + el equipo del revisor (interno). */
interface StoredClaim extends DocumentReviewClaim {
  teamOrganizationId?: string;
}

/** Revisor de otro equipo: se sabe que el expediente está tomado, no por quién. */
export const OTHER_TEAM_REVIEWER_ID = '00000000-0000-0000-0000-000000000000';
export const OTHER_TEAM_REVIEWER_LABEL = 'otro equipo de plataforma';

/**
 * Reservas de revisión del workspace de plataforma (Ola 3, R3-6). Viven en
 * Redis con vencimiento (`SET NX PX`), así que no necesitan migración ni tabla
 * de negocio: no hay datos de ninguna organización, solo "quién está mirando
 * qué expediente". Tomar y liberar quedan en la auditoría append-only de la
 * organización reservada. Es coordinación del equipo: no reemplaza el RBAC de
 * plataforma que protege las decisiones.
 */
@Injectable()
export class ReviewClaimsService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly audit: AuditService,
  ) {}

  async list(viewer: Pick<ReviewClaimActor, 'teamOrganizationId'>): Promise<DocumentReviewClaim[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', 200);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    if (keys.length === 0) return [];
    const values = await this.redis.mget(...keys);
    return values
      .map((value) => parseClaim(value))
      .filter((claim): claim is StoredClaim => claim !== null)
      .map((claim) => presentClaim(claim, viewer.teamOrganizationId))
      .sort((a, b) => a.claimedAt.localeCompare(b.claimedAt));
  }

  /** Toma (o renueva, si ya es suya) la reserva de una organización. Si otro
   *  revisor la tiene vigente → 409 con el dueño actual. */
  async claim(actor: ReviewClaimActor, organizationId: string): Promise<DocumentReviewClaim> {
    assertUuid(organizationId);
    const key = KEY_PREFIX + organizationId;
    const now = new Date();
    const claim: StoredClaim = {
      organizationId,
      reviewerUserId: actor.id,
      reviewerEmail: actor.email,
      claimedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + REVIEW_CLAIM_TTL_MS).toISOString(),
      teamOrganizationId: actor.teamOrganizationId,
    };

    const created = await this.redis.set(
      key,
      JSON.stringify(claim),
      'PX',
      REVIEW_CLAIM_TTL_MS,
      'NX',
    );
    if (created === 'OK') {
      await this.record(actor.id, organizationId, 'platform.review_claim.taken');
      return presentClaim(claim, actor.teamOrganizationId);
    }

    const current = parseClaim(await this.redis.get(key));
    if (current && current.reviewerUserId !== actor.id) {
      const shown = presentClaim(current, actor.teamOrganizationId);
      throw new ConflictException({
        message: `Este expediente lo está revisando ${shown.reviewerEmail}.`,
        claim: shown,
      });
    }
    // Renovación: conserva cuándo empezó, extiende el vencimiento.
    const renewed: StoredClaim = {
      ...claim,
      claimedAt: current?.claimedAt ?? claim.claimedAt,
    };
    await this.redis.set(key, JSON.stringify(renewed), 'PX', REVIEW_CLAIM_TTL_MS);
    return presentClaim(renewed, actor.teamOrganizationId);
  }

  async release(actor: ReviewClaimActor, organizationId: string): Promise<void> {
    assertUuid(organizationId);
    const key = KEY_PREFIX + organizationId;
    const result = Number(await this.redis.eval(RELEASE_IF_OWNER, 1, key, actor.id));
    if (result === 0) throw new NotFoundException('No hay una reserva vigente.');
    if (result === -1) {
      if (!actor.canOverride) {
        throw new ForbiddenException('Solo quien reservó el expediente puede liberarlo.');
      }
      // Un líder solo libera reservas de su propio equipo.
      const current = parseClaim(await this.redis.get(key));
      if (current?.teamOrganizationId && current.teamOrganizationId !== actor.teamOrganizationId) {
        throw new ForbiddenException('La reserva es de otro equipo de plataforma.');
      }
      await this.redis.del(key);
      await this.record(actor.id, organizationId, 'platform.review_claim.overridden');
      return;
    }
    await this.record(actor.id, organizationId, 'platform.review_claim.released');
  }

  private record(actorUserId: string, organizationId: string, action: string) {
    return this.audit.record({
      organizationId,
      actorUserId,
      action,
      entityType: 'organization',
      entityId: organizationId,
    });
  }
}

function assertUuid(organizationId: string): void {
  if (!UUID_RE.test(organizationId)) throw new BadRequestException('Invalid organization id');
}

/** Quita el dato interno del equipo y, si la reserva es de OTRO equipo, oculta
 *  quién la tiene (F19: un equipo no ve al personal de otro). Las reservas
 *  previas sin equipo se muestran como antes (vencen solas en 30 min). */
function presentClaim(claim: StoredClaim, viewerTeamId: string): DocumentReviewClaim {
  const { teamOrganizationId, ...visible } = claim;
  if (teamOrganizationId && teamOrganizationId !== viewerTeamId) {
    return {
      ...visible,
      reviewerUserId: OTHER_TEAM_REVIEWER_ID,
      reviewerEmail: OTHER_TEAM_REVIEWER_LABEL,
    };
  }
  return visible;
}

function parseClaim(value: string | null): StoredClaim | null {
  if (!value) return null;
  try {
    const claim = JSON.parse(value) as StoredClaim;
    return typeof claim.organizationId === 'string' && typeof claim.reviewerUserId === 'string'
      ? claim
      : null;
  } catch {
    return null;
  }
}
