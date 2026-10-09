import { ServiceUnavailableException } from '@nestjs/common';
import type {
  AdoptionSignatureRequest,
  AdoptionSignatureResult,
  SignaturePort,
} from '@adoptafacil/contracts';

/**
 * SignaturePort bound when SIGNATURE_DRIVER=disabled (Ola 1, R0-1). The only
 * other adapter is the simulated one, which stamps `fake:` signature ids and
 * provider `fake-local` on real contracts; env validation refuses it in
 * production. Until a real electronic-signature adapter exists (Ley 527/1999,
 * pending legal review), signing a contract in production answers 503
 * instead of producing a signature that only looks valid.
 */
export class DisabledSignatureAdapter implements SignaturePort {
  async sign(_request: AdoptionSignatureRequest): Promise<AdoptionSignatureResult> {
    throw new ServiceUnavailableException('Electronic signature is not enabled.');
  }
}
