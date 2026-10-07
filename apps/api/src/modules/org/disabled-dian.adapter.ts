import type { DianPort, DianVerificationResult } from './dian.port';

/**
 * DianPort bound when DIAN_DRIVER=disabled (Ola 1, R0-1, SEC-003). There is
 * no DIAN API (documento base), and the fake adapter answered "verified" on
 * the first call, which let an organization self-certify its RTE. In
 * production nothing is verified automatically: every attempt reports
 * `verified: false`, and RTE status can only come from a human review by the
 * platform (TODO(client): that review flow belongs to formalization, R2-2).
 */
export class DisabledDianAdapter implements DianPort {
  async verifyRteStatus(_nit: string): Promise<DianVerificationResult> {
    return { verified: false };
  }
}
