import { Prisma } from '@prisma/client';

/**
 * Documento de identidad de las personas que autorizaron a la organización a
 * identificarlas (Ley 1581 de 2012). El documento vive en el perfil de la
 * persona, que la organización no puede leer: solo la función SECURITY DEFINER
 * `consented_person_documents` lo entrega y únicamente con consentimiento
 * vigente para ESA organización. Quien no autorizó (o revocó) no aparece.
 */
export async function loadConsentedDocuments(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  organizationId: string,
  userIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const rows = await tx.$queryRaw<Array<{ user_id: string; document_id: string }>>(Prisma.sql`
    SELECT user_id, document_id
      FROM consented_person_documents(${organizationId}::uuid, ${ids}::uuid[])
  `);
  return new Map(rows.map((r) => [r.user_id, r.document_id.trim()]));
}
