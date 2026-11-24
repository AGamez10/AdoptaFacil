import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  isApexDomain,
  normalizePortalDomain,
  type PortalDnsRecord,
  type PortalDomainCheckError,
  type PortalDomainView,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { AuditService } from '../../core/audit/audit.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { PlansService } from '../../core/plans/plans.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudflareCustomHostnames } from './cloudflare-custom-hostnames';

/** Nombre del registro TXT de verificación, delante del dominio. */
export const PORTAL_DOMAIN_TXT_LABEL = '_adoptafacil';
const TXT_PREFIX = 'adoptafacil-verify=';

/**
 * Consultas DNS detrás de una clase simulable (las pruebas la reemplazan).
 * Resolvedores públicos: lo que ve el mundo, no la caché del servidor. Un
 * nombre que no existe devuelve lista vacía; un fallo del DNS lanza.
 */
@Injectable()
export class PortalDnsLookup {
  private resolver(): Resolver {
    const resolver = new Resolver({ timeout: 4000, tries: 2 });
    resolver.setServers(['1.1.1.1', '8.8.8.8']);
    return resolver;
  }

  private async safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOTFOUND' || code === 'ENODATA') return [];
      throw error;
    }
  }

  txt(name: string): Promise<string[]> {
    return this.safe(async () =>
      (await this.resolver().resolveTxt(name)).map((parts) => parts.join('')),
    );
  }

  cname(name: string): Promise<string[]> {
    return this.safe(() => this.resolver().resolveCname(name));
  }

  a(name: string): Promise<string[]> {
    return this.safe(() => this.resolver().resolve4(name));
  }
}

const trimDot = (value: string) => value.toLowerCase().replace(/\.$/, '');

/**
 * Resultado de revisar los registros DNS de un dominio contra lo que
 * AdoptaFácil espera. Pura: recibe lo que respondió el DNS.
 */
export function evaluatePortalDns(input: {
  token: string;
  txt: string[];
  cname: string[];
  a: string[];
  target: string;
  ipv4: string | undefined;
}): PortalDomainCheckError | null {
  if (!input.txt.some((value) => value.trim() === `${TXT_PREFIX}${input.token}`)) {
    return 'txt_missing';
  }
  const target = trimDot(input.target);
  const pointsByCname = input.cname.some((value) => trimDot(value) === target);
  const pointsByA =
    Boolean(input.ipv4) && input.a.length > 0 && input.a.every((ip) => ip === input.ipv4);
  return pointsByCname || pointsByA ? null : 'target_mismatch';
}

/**
 * Dominio propio del portal (plan Pro). La organización compra su dominio y
 * crea dos registros: el que apunta a AdoptaFácil (CNAME a
 * `CUSTOM_DOMAIN_CNAME_TARGET`, o A a `CUSTOM_DOMAIN_IPV4` para la raíz) y un
 * TXT `_adoptafacil.<dominio>` que prueba que es suya. Al verificar, el portal
 * responde en ese dominio y Caddy emite el certificado HTTPS la primera vez
 * que alguien entra (on-demand TLS, autorizado SOLO por {@link isServable}).
 *
 * Con Cloudflare for SaaS ({@link CloudflareCustomHostnames}), al verificar
 * se registra además como custom hostname de la zona: el tráfico entra por
 * Cloudflare, que emite el certificado público, y el VPS sigue cerrado a sus
 * IPs. En ese modo no se conecta la raíz del dominio.
 *
 * Si el plan deja de incluirlo, el dominio deja de servirse (sin borrar nada)
 * y vuelve solo al renovar. Todo cambio queda en la auditoría.
 */
@Injectable()
export class PortalDomainService {
  private readonly logger = new Logger('PortalDomains');
  private readonly target: string | undefined;
  private readonly ipv4: string | undefined;
  private readonly platformHost: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
    private readonly dns: PortalDnsLookup,
    private readonly edge: CloudflareCustomHostnames,
    config: ConfigService<Env, true>,
  ) {
    this.target = config.get('CUSTOM_DOMAIN_CNAME_TARGET', { infer: true }) as string | undefined;
    // Cloudflare for SaaS (plan Free) solo enruta subdominios por CNAME: la
    // raíz con un registro A al VPS se saltaría Cloudflare y el origen cerrado.
    this.ipv4 = edge.enabled
      ? undefined
      : (config.get('CUSTOM_DOMAIN_IPV4', { infer: true }) as string | undefined);
    const web = config.get('WEB_BASE_URL', { infer: true }) as string;
    this.platformHost = (/^https?:\/\/([^/:]+)/i.exec(web)?.[1] ?? '').toLowerCase();
  }

  get enabled(): boolean {
    return Boolean(this.target);
  }

  /** Registros a crear, con el nombre completo (cada registrador lo pide a su manera). */
  private records(domain: string, token: string): PortalDnsRecord[] {
    const pointing: PortalDnsRecord =
      isApexDomain(domain) && this.ipv4
        ? { type: 'A', name: domain, value: this.ipv4 }
        : { type: 'CNAME', name: domain, value: this.target ?? '' };
    return [
      pointing,
      { type: 'TXT', name: `${PORTAL_DOMAIN_TXT_LABEL}.${domain}`, value: `${TXT_PREFIX}${token}` },
    ];
  }

  private tenant(actor: RequestUser): string {
    if (!actor.organizationId) throw new ForbiddenException('Missing tenant context');
    return actor.organizationId;
  }

  /** `GET /org/portal/domain`. */
  async view(actor: RequestUser): Promise<PortalDomainView> {
    const organizationId = this.tenant(actor);
    const [row, planIncludes] = await Promise.all([
      this.prisma.withOrgContext(organizationId, (tx) =>
        tx.portalCustomDomain.findUnique({ where: { organizationId } }),
      ),
      this.plans.hasCapability(organizationId, 'customDomain'),
    ]);
    const base = {
      planIncludes,
      lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
      lastError: (row?.lastError as PortalDomainCheckError | null) ?? null,
      verifiedAt: row?.verifiedAt?.toISOString() ?? null,
    };
    if (!this.enabled) {
      return { ...base, state: 'unavailable', domain: row?.domain ?? null, records: [] };
    }
    if (!row) return { ...base, state: 'none', domain: null, records: [] };
    const state = row.status === 'active' ? (planIncludes ? 'active' : 'suspended') : 'pending_dns';
    const certificate = state === 'active' ? await this.edgeStatus(row.domain) : undefined;
    return {
      ...base,
      state,
      domain: row.domain,
      records: this.records(row.domain, row.verificationToken),
      ...(certificate ? { certificate } : {}),
    };
  }

  /** Estado del certificado en Cloudflare; `undefined` sin SaaS o si no responde. */
  private async edgeStatus(domain: string): Promise<'pending' | 'active' | undefined> {
    if (!this.edge.enabled) return undefined;
    try {
      return (await this.edge.status(domain)) ?? 'pending';
    } catch (error) {
      this.logger.warn(`Cloudflare status ${domain}: ${(error as Error).message}`);
      return undefined;
    }
  }

  /** Quita el dominio de Cloudflare sin frenar a la organización si falla. */
  private async edgeRemove(domain: string): Promise<void> {
    if (!this.edge.enabled) return;
    try {
      await this.edge.remove(domain);
    } catch (error) {
      this.logger.warn(`Cloudflare remove ${domain}: ${(error as Error).message}`);
    }
  }

  /** `PUT /org/portal/domain`: pide (o cambia) el dominio. Queda pendiente de DNS. */
  async request(actor: RequestUser, rawDomain: string): Promise<PortalDomainView> {
    const organizationId = this.tenant(actor);
    if (!this.enabled) {
      throw new ServiceUnavailableException('Los dominios propios aún no están habilitados.');
    }
    await this.plans.assertCapability(organizationId, 'customDomain');
    const domain = normalizePortalDomain(rawDomain);
    if (!domain) {
      throw new BadRequestException('Escribe un dominio válido, por ejemplo www.turefugio.org.');
    }
    if (
      this.platformHost &&
      (domain === this.platformHost || domain.endsWith(`.${this.platformHost}`))
    ) {
      throw new BadRequestException(
        'Ese es un dominio de AdoptaFácil. Escribe el dominio que compraste para tu organización.',
      );
    }
    if (isApexDomain(domain) && !this.ipv4) {
      throw new BadRequestException(
        `Usa un subdominio como www.${domain}: la raíz del dominio no se puede conectar todavía.`,
      );
    }
    const replaced = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const previous = await tx.portalCustomDomain.findUnique({ where: { organizationId } });
      if (previous?.domain === domain) return null;
      const token = randomBytes(16).toString('hex');
      await tx.portalCustomDomain.upsert({
        where: { organizationId },
        create: {
          organizationId,
          domain,
          verificationToken: token,
          createdByUserId: actor.id,
        },
        update: {
          domain,
          status: 'pending_dns',
          verificationToken: token,
          lastCheckedAt: null,
          lastError: null,
          verifiedAt: null,
          createdByUserId: actor.id,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'portal.custom_domain_requested',
        entityType: 'portal_custom_domain',
        entityId: organizationId,
        metadata: { domain, previousDomain: previous?.domain ?? null },
      });
      return previous?.status === 'active' ? previous.domain : null;
    });
    if (replaced) await this.edgeRemove(replaced);
    return this.view(actor);
  }

  /** `POST /org/portal/domain/verify`: revisa el DNS y, si está bien, lo activa. */
  async verify(actor: RequestUser): Promise<PortalDomainView> {
    const organizationId = this.tenant(actor);
    if (!this.enabled) {
      throw new ServiceUnavailableException('Los dominios propios aún no están habilitados.');
    }
    await this.plans.assertCapability(organizationId, 'customDomain');
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.portalCustomDomain.findUnique({ where: { organizationId } }),
    );
    if (!row) throw new ConflictException('Primero escribe el dominio que quieres conectar.');

    let error: PortalDomainCheckError | null;
    try {
      const host = row.domain;
      const [txt, cname, a] = await Promise.all([
        this.dns.txt(`${PORTAL_DOMAIN_TXT_LABEL}.${host}`),
        this.dns.cname(host),
        this.dns.a(host),
      ]);
      error = evaluatePortalDns({
        token: row.verificationToken,
        txt,
        cname,
        a,
        target: this.target as string,
        ipv4: this.ipv4,
      });
    } catch (dnsError) {
      this.logger.warn(`DNS check for ${row.domain}: ${(dnsError as Error).message}`);
      error = 'dns_error';
    }
    if (!error) {
      const taken = await this.prisma.$queryRaw<Array<{ taken: boolean }>>(
        Prisma.sql`SELECT portal_custom_domain_taken(${row.domain}, ${organizationId}::uuid) AS taken`,
      );
      if (taken[0]?.taken) error = 'taken';
    }
    if (!error && this.edge.enabled) {
      try {
        await this.edge.ensure(row.domain);
      } catch (edgeError) {
        this.logger.warn(`Cloudflare ensure ${row.domain}: ${(edgeError as Error).message}`);
        error = 'edge_error';
      }
    }

    const now = new Date();
    let lost = false;
    await this.prisma
      .withOrgContext(organizationId, async (tx) => {
        if (error) {
          // Un dominio ya activo con un fallo pasajero (DNS o Cloudflare) sigue
          // activo; si los registros desaparecieron, vuelve a pendiente.
          const keepActive =
            row.status === 'active' && (error === 'dns_error' || error === 'edge_error');
          await tx.portalCustomDomain.update({
            where: { organizationId },
            data: {
              lastCheckedAt: now,
              lastError: error,
              ...(keepActive ? {} : { status: 'pending_dns' }),
            },
          });
          if (row.status === 'active' && !keepActive) {
            lost = true;
            await this.audit.recordWithTx(tx, {
              organizationId,
              actorUserId: actor.id,
              action: 'portal.custom_domain_lost',
              entityType: 'portal_custom_domain',
              entityId: row.id,
              metadata: { domain: row.domain, reason: error },
            });
          }
          return;
        }
        await tx.portalCustomDomain.update({
          where: { organizationId },
          data: {
            status: 'active',
            lastCheckedAt: now,
            lastError: null,
            verifiedAt: row.status === 'active' ? row.verifiedAt : now,
          },
        });
        if (row.status !== 'active') {
          await this.audit.recordWithTx(tx, {
            organizationId,
            actorUserId: actor.id,
            action: 'portal.custom_domain_verified',
            entityType: 'portal_custom_domain',
            entityId: row.id,
            metadata: { domain: row.domain },
          });
        }
      })
      .catch((dbError: unknown) => {
        // Carrera: otra organización activó el mismo dominio un instante antes.
        if ((dbError as { code?: string }).code === 'P2002') {
          throw new ConflictException('Ese dominio ya está conectado a otra organización.');
        }
        throw dbError;
      });
    // Los registros desaparecieron: también deja de enrutarse por Cloudflare.
    if (lost) await this.edgeRemove(row.domain);
    return this.view(actor);
  }

  /** `DELETE /org/portal/domain`: desconecta el dominio. El portal sigue en su enlace. */
  async remove(actor: RequestUser): Promise<PortalDomainView> {
    const organizationId = this.tenant(actor);
    const removed = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.portalCustomDomain.findUnique({ where: { organizationId } });
      if (!row) return null;
      await tx.portalCustomDomain.delete({ where: { organizationId } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'portal.custom_domain_removed',
        entityType: 'portal_custom_domain',
        entityId: row.id,
        metadata: { domain: row.domain, status: row.status },
      });
      return row.status === 'active' ? row.domain : null;
    });
    if (removed) await this.edgeRemove(removed);
    return this.view(actor);
  }

  /**
   * El slug del portal que se sirve en `host`, o `null`. Solo dominios
   * verificados cuya organización tiene hoy un plan con dominio propio. Lo usa
   * la web (qué portal mostrar) y Caddy (si puede emitir el certificado).
   */
  async servableSlug(host: string): Promise<string | null> {
    if (!this.enabled) return null;
    const domain = normalizePortalDomain(host);
    if (!domain) return null;
    const rows = await this.prisma.$queryRaw<
      Array<{ organization_id: string; slug: string | null }>
    >(Prisma.sql`SELECT organization_id, slug FROM portal_custom_domain_owner(${domain})`);
    const owner = rows[0];
    if (!owner?.slug) return null;
    const allowed = await this.plans.hasCapability(owner.organization_id, 'customDomain');
    return allowed ? owner.slug : null;
  }
}
