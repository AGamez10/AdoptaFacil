import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';

/** The platform account the seed used to create with a fixed password
 *  (AF-037) before defaults were removed. */
export const LEGACY_SEED_EMAIL = 'admin@adoptafacil.local';
const LEGACY_SEED_PASSWORD = 'changeme123';

/**
 * AF-037 safety net for databases seeded BEFORE the fix: at boot, if the old
 * seed account still opens with its well-known password, the API refuses to
 * start in production (and warns elsewhere). Fix: rotate it with
 * `pnpm seed:admin -- --rotate-password` (see docs/seguridad/roles-y-organizaciones.md).
 */
@Injectable()
export class DefaultCredentialsCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger(DefaultCredentialsCheck.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!(await this.legacyDefaultStillWorks())) {
      return;
    }
    const message =
      `La cuenta semilla ${LEGACY_SEED_EMAIL} conserva la contraseña por defecto (AF-037). ` +
      'Rótala con `pnpm seed:admin -- --rotate-password` antes de exponer la API.';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }
    this.logger.warn(message);
  }

  async legacyDefaultStillWorks(): Promise<boolean> {
    // auth_credentials is the global identity index (not under RLS), readable
    // before any tenant context exists — same lookup as login.
    const credential = await this.prisma.authCredential.findUnique({
      where: { email: LEGACY_SEED_EMAIL },
    });
    if (!credential) {
      return false;
    }
    return this.passwords.verify(LEGACY_SEED_PASSWORD, credential.passwordHash);
  }
}
