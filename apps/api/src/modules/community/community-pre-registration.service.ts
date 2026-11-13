import { Injectable } from '@nestjs/common';

import type {
  CommunityPreRegistrationInput,
  CommunityPreRegistrationReceipt,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Pre-registro público de comercios y profesionales (MVP). Solo INSERTA: la
 * tabla no tiene `organization_id` ni RLS y el rol de la app no puede leerla
 * (ver la migración). Guardamos el consentimiento con la hora en que se dio.
 */
@Injectable()
export class CommunityPreRegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CommunityPreRegistrationInput): Promise<CommunityPreRegistrationReceipt> {
    await this.prisma.$executeRaw`
      INSERT INTO community_pre_registrations (
        id, kind, business_name, category, city,
        contact_name, contact_email, contact_phone, message, consent_at
      ) VALUES (
        gen_random_uuid(), ${input.kind}, ${input.businessName}, ${input.category}, ${input.city},
        ${input.contactName}, ${input.contactEmail}, ${input.contactPhone ?? null},
        ${input.message ?? null}, ${new Date()}
      )
    `;
    return { received: true };
  }
}
