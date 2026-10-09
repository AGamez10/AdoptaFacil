import { DocumentType } from '@adoptafacil/contracts';

/**
 * Ayuda proactiva del onboarding (anexo #4 · F20) para cuando una
 * organización todavía NO tiene un documento. El texto es orientación
 * general, no asesoría legal: el trámite exacto depende del tipo de
 * organización, por eso cada guía termina invitando a escribirle al equipo.
 *
 * TODO(client): validar con el abogado/contador del proyecto el texto de cada
 * paso antes del lanzamiento público (no se citan normas ni plazos a
 * propósito, para no afirmar nada que no se haya verificado en fuente oficial).
 */
export interface DocumentHelp {
  /** Título amable del panel. */
  title: string;
  /** Qué es, en una frase. */
  what: string;
  /** Pasos generales, en orden. */
  steps: string[];
  /** Qué desbloquea en AdoptaFácil (solo cosas que existen hoy). */
  unlocks: string;
  /** Mensaje prellenado para WhatsApp (la persona lo edita antes de enviar). */
  whatsappMessage: string;
}

export const DOCUMENT_HELP: Partial<Record<DocumentType, DocumentHelp>> = {
  [DocumentType.Rut]: {
    title: '¿Aún no tienes el RUT?',
    what: 'El RUT es el registro de tu organización ante la DIAN y de ahí sale su NIT.',
    steps: [
      'Si tu organización todavía no existe legalmente, el primer paso es constituirla (acta y estatutos) y registrarla.',
      'Con la organización constituida se hace la inscripción en el RUT ante la DIAN.',
      'Descarga el PDF del RUT y súbelo aquí. Nuestro equipo lo revisa.',
    ],
    unlocks:
      'Con el RUT aprobado subes de nivel de verificación y tu portal muestra el sello "RUT revisado por AdoptaFácil".',
    whatsappMessage:
      'Hola, estoy registrando mi organización en AdoptaFácil y todavía no tengo el RUT. ¿Me ayudan con el paso a paso?',
  },
  [DocumentType.ExistenceRepresentationCertificate]: {
    title: '¿No tienes el certificado de existencia y representación?',
    what: 'Es el documento que prueba que tu organización existe y quién la representa legalmente. Lo expide la entidad donde está registrada, normalmente la Cámara de Comercio.',
    steps: [
      'Si ya estás registrada, puedes pedir el certificado actualizado a la Cámara de Comercio de tu ciudad.',
      'Si aún no te has registrado, primero se constituye la organización y se inscribe.',
      'Sube el certificado aquí (PDF o foto legible). Nuestro equipo lo revisa.',
    ],
    unlocks:
      'Junto con el RUT, te lleva al siguiente nivel de verificación y suma un sello de confianza en tu portal.',
    whatsappMessage:
      'Hola, estoy registrando mi organización en AdoptaFácil y no tengo el certificado de existencia y representación (Cámara de Comercio). ¿Me ayudan?',
  },
};
