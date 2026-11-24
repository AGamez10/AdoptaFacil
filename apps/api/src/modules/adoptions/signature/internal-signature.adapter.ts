import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type {
  AdoptionSignatureRequest,
  AdoptionSignatureResult,
  SignaturePort,
} from '@adoptafacil/contracts';

/**
 * Firma electrónica SIMPLE hecha por la propia plataforma (decisión del dueño,
 * 2026-11-24): SIGNATURE_DRIVER=internal, el valor de producción.
 *
 * No hay proveedor externo ni certificado digital. La firma es el conjunto de
 * lo que la plataforma ya registra al firmar (`AdoptionContractsService.sign`):
 * la persona autenticada, la imagen de la firma dibujada (cifrada), su huella,
 * la huella SHA-256 del contrato, la fecha UTC y el evento de auditoría
 * append-only. Este adaptador solo emite un identificador único y verificable
 * que amarra firmante + contrato + huella del documento + instante.
 *
 * Ley 527 de 1999 (art. 7) y Decreto 2364 de 2012 admiten la firma electrónica
 * simple si es confiable y apropiada; que lo sea para un contrato de adopción
 * es POR CONFIRMAR CON ABOGADO (el texto del contrato sigue marcado como
 * borrador sujeto a revisión). No se presenta como firma digital certificada.
 */
@Injectable()
export class InternalSignatureAdapter implements SignaturePort {
  private readonly logger = new Logger('SignaturePort');
  static readonly PROVIDER = 'adoptafacil-firma-electronica-simple';

  async sign(request: AdoptionSignatureRequest): Promise<AdoptionSignatureResult> {
    const signedAt = new Date().toISOString();
    const nonce = randomUUID();
    const digest = createHash('sha256')
      .update(
        [
          request.contractId,
          request.signerId,
          request.signerRole,
          request.documentHash,
          signedAt,
          nonce,
        ].join(':'),
        'utf8',
      )
      .digest('hex');
    // Sin datos personales en el log: solo ids.
    this.logger.log(`signed contract=${request.contractId} signer=${request.signerId}`);
    return {
      signatureId: `afs1:${digest}`,
      signedAt,
      provider: InternalSignatureAdapter.PROVIDER,
    };
  }
}
