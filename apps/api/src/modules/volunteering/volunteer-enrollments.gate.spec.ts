import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import type { AuditService } from '../../core/audit/audit.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { IncompleteProfileException } from '../../core/auth/require-complete-profile';
import type { NotificationPort } from '../../core/notifications/notification.port';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContextService } from '../../core/tenant/tenant-context.service';
import { VolunteerEnrollmentsService } from './volunteer-enrollments.service';

/**
 * The profile-completion gate (T-Google-SignIn, business rule #3) wired into
 * ONE of the 3 gated endpoints (`POST /volunteer-enrollments` →
 * `VolunteerEnrollmentsService.enroll`). Verifies the gate runs BEFORE any DB
 * write and that it does not interfere with the happy path once the profile
 * is complete — mirrors the exact wiring in donations/sponsorships/adoptions.
 */

const ACTOR: RequestUser = {
  id: 'user-1',
  organizationId: 'org-1',
  accountType: 'person',
  email: 'volunteer@example.com',
};

function makeService(
  profile: unknown,
  minorsEnabled = false,
): {
  service: VolunteerEnrollmentsService;
  queryRaw: jest.Mock;
} {
  const queryRaw = jest.fn().mockResolvedValue([
    {
      id: 'enr-1',
      organization_id: 'org-2',
      opportunity_id: 'opp-1',
      volunteer_user_id: ACTOR.id,
      volunteer_name: 'Voluntario',
      volunteer_email: ACTOR.email,
      applies_to_student_service: false,
      status: 'pending',
      rejection_reason: null,
      decided_by_user_id: null,
      decided_at: null,
      created_at: new Date(),
    },
  ]);
  const withOrgContext = jest
    .fn()
    .mockImplementation((_org: string, cb: (tx: unknown) => unknown) =>
      cb({ user: { findUnique: jest.fn().mockResolvedValue(profile) } }),
    );
  const prisma = {
    $queryRaw: queryRaw,
    withOrgContext,
    volunteerOpportunity: { findUnique: jest.fn().mockResolvedValue(null) },
    organization: { findUnique: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  const tenant = {} as unknown as TenantContextService;
  const audit = { record: jest.fn().mockResolvedValue({}) } as unknown as AuditService;
  const notifications = {
    send: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationPort;
  const config = {
    get: (key: string) => (key === 'FEATURE_VOLUNTEERING_MINORS' ? minorsEnabled : undefined),
  } as unknown as ConfigService<Env, true>;
  const service = new VolunteerEnrollmentsService(prisma, tenant, audit, notifications, config);
  return { service, queryRaw };
}

describe('VolunteerEnrollmentsService.enroll — profile-completion gate', () => {
  it('rejects with 422 INCOMPLETE_PROFILE BEFORE touching the enrollment DB write', async () => {
    const { service, queryRaw } = makeService({ phone: null, documentId: null, address: null });

    const error = await service.enroll(ACTOR, { opportunityId: 'opp-1' }).catch((e) => e);

    expect(error).toBeInstanceOf(IncompleteProfileException);
    expect(error.getResponse()).toEqual({
      error: 'INCOMPLETE_PROFILE',
      missing: ['phone', 'documentId', 'address'],
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('proceeds to enroll once phone/documentId/address are all set', async () => {
    const { service, queryRaw } = makeService({
      phone: '3001234567',
      documentId: '1000000000',
      address: 'Calle 1 #2-3',
    });

    const enrollment = await service.enroll(ACTOR, { opportunityId: 'opp-1' });

    expect(enrollment.id).toBe('enr-1');
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('VolunteerEnrollmentsService.enroll — menores (P0-1)', () => {
  const COMPLETE = { phone: '3001234567', documentId: '1000000000', address: 'Calle 1 #2-3' };

  it.each([{ isMinor: true }, { guardianName: 'Acudiente' }, { guardianDocument: '123' }])(
    'con el flag apagado rechaza %o con 403 y sin escribir nada',
    async (extra) => {
      const { service, queryRaw } = makeService(COMPLETE);
      await expect(
        service.enroll(ACTOR, { opportunityId: 'opp-1', ...extra }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(queryRaw).not.toHaveBeenCalled();
    },
  );

  it('con el flag apagado un adulto se inscribe (institución educativa opcional)', async () => {
    const { service, queryRaw } = makeService(COMPLETE);
    await service.enroll(ACTOR, {
      opportunityId: 'opp-1',
      isMinor: false,
      schoolName: 'U. Nacional',
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('con el flag encendido (solo fuera de producción) acepta la inscripción de un menor', async () => {
    const { service, queryRaw } = makeService(COMPLETE, true);
    await service.enroll(ACTOR, { opportunityId: 'opp-1', isMinor: true });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
