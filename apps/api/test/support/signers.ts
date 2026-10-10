import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PasswordService } from '../../src/core/auth/password.service';
import { TokenService } from '../../src/core/auth/token.service';
import type {
  NotificationMessage,
  NotificationPort,
} from '../../src/core/notifications/notification.port';

/** Captura los correos (la invitación vive SOLO en el enlace enviado). */
export class CapturingNotificationPort implements NotificationPort {
  readonly sent: NotificationMessage[] = [];
  async send(message: NotificationMessage): Promise<void> {
    this.sent.push(message);
  }
}

export interface SignerActor {
  token: string;
  userId: string;
  orgId: string;
  email: string;
}

export const SIGNATURE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * El flujo REAL: el Owner invita por correo, la persona abre el enlace y crea
 * SU PROPIA cuenta y contraseña (la plataforma nunca la conoce). Devuelve la
 * sesión de esa persona.
 */
export async function inviteSigner(
  server: ReturnType<INestApplication['getHttpServer']>,
  notifications: CapturingNotificationPort,
  owner: { token: string },
  signerRole: 'accountant' | 'fiscal_reviewer',
  displayName = 'Firmante',
): Promise<SignerActor & { invitationId: string }> {
  const email = `signer-${randomUUID()}@test.local`;
  const invitation = await request(server)
    .post('/org/invitations')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ email, role: 'read_only_auditor', signerRole })
    .expect(201);
  const message = [...notifications.sent].reverse().find((m) => m.to === email);
  const match = message?.body.match(/\/invitacion#token=([A-Za-z0-9_%-]+)/);
  if (!match) throw new Error(`no invitation link sent to ${email}`);
  const accepted = await request(server)
    .post('/auth/invitations/accept')
    .send({ token: decodeURIComponent(match[1]), displayName, password: 'password-1234' })
    .expect(201);
  return {
    token: accepted.body.tokens.accessToken,
    userId: accepted.body.user.id,
    orgId: accepted.body.user.organizationId,
    email,
    invitationId: invitation.body.id,
  };
}

/** Un miembro con un rol fijo (para el redactor: Administrator). */
export async function memberWithRole(
  app: INestApplication,
  admin: PrismaClient,
  orgId: string,
  role: string,
): Promise<{ token: string; userId: string; orgId: string }> {
  const userId = randomUUID();
  const email = `member-${randomUUID()}@test.local`;
  const passwordHash = await new PasswordService().hash('password-1234');
  await admin.user.create({
    data: {
      id: userId,
      organizationId: orgId,
      accountType: 'organization',
      email,
      displayName: role,
    },
  });
  await admin.authCredential.create({
    data: { userId, organizationId: orgId, accountType: 'organization', email, passwordHash },
  });
  await admin.userRole.create({ data: { organizationId: orgId, userId, role } });
  const tokens = await app
    .get(TokenService)
    .issueTokens({ userId, organizationId: orgId, accountType: 'organization', email });
  return { token: tokens.accessToken, userId, orgId };
}

/** Registra la firma del propio actor bajo un cargo. */
export function registerOwnSignature(
  server: ReturnType<INestApplication['getHttpServer']>,
  actor: { token: string },
  role: 'legal_representative' | 'accountant' | 'fiscal_reviewer',
  fullName: string,
) {
  return request(server)
    .post('/org/legal-representative')
    .set('Authorization', `Bearer ${actor.token}`)
    .send({
      role,
      fullName,
      documentType: 'cedula_ciudadania',
      documentNumber: '79000111',
      position: role === 'legal_representative' ? 'Representante legal' : 'Revisora fiscal',
      signatureBase64: SIGNATURE_PNG,
      signatureContentType: 'image/png',
    });
}
