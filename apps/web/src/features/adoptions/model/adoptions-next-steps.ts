import {
  DEFAULT_FOLLOW_UP_MONTHS,
  DEFAULT_FOLLOW_UP_PLAN,
  type AdoptionContract,
  type AdoptionFollowUpPlan,
} from '@adoptafacil/contracts';

/**
 * Los dos planes de seguimiento, explicados para quien no conoce el sistema
 * (punto 12). La única diferencia real es un contacto extra a los 15 días.
 */
export const FOLLOW_UP_PLAN_HELP: Record<AdoptionFollowUpPlan, string> = {
  light: 'Ligero: tres contactos, al mes, a los 4 meses y a los 12 meses.',
  standard:
    'Acompañado: los mismos tres contactos más uno a los 15 días, para adopciones que necesitan más apoyo al comienzo.',
};

/** Cuándo se programan y cómo se avisan los contactos (igual para los dos planes). */
export const FOLLOW_UP_WHEN_HELP =
  'Los contactos se programan solos cuando el adoptante confirma que recibió al animal. ' +
  'Los ve en «Mis seguimientos», responde con unas preguntas cortas y una foto, y si se le pasa la fecha le llega un recordatorio por correo.';

/** "al mes, a los 4 meses y a los 12 meses", recortado al plazo pactado. */
export function followUpContactsText(plan: AdoptionFollowUpPlan, months: number): string {
  const parts: string[] = [];
  if (plan === 'standard') parts.push('a los 15 días');
  if (months >= 1) parts.push('al mes');
  if (months >= 4) parts.push('a los 4 meses');
  if (months >= 12) parts.push('a los 12 meses');
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

export interface ContractNextSteps {
  title: string;
  /** Pasos en orden; `done` marca los que ya pasaron. */
  steps: { text: string; done: boolean }[];
}

/**
 * Qué sigue para quien está mirando el contrato (punto 14): una lista corta,
 * distinta para la organización y para el adoptante, según el estado.
 * `null` cuando no hay nada que guiar (contrato cancelado).
 */
export function contractNextSteps(
  contract: AdoptionContract,
  viewer: 'organization' | 'adopter',
  opts: { dataComplete: boolean; viewerHasSigned: boolean },
): ContractNextSteps | null {
  const animal = contract.payload.animal.name;
  const data = contract.payload.data;
  const representativeSigned = contract.signers.some(
    (s) => s.role === 'organization_representative' && Boolean(s.signedAt),
  );
  const contacts = followUpContactsText(
    data.followUpPlan ?? DEFAULT_FOLLOW_UP_PLAN,
    data.followUpMonths ?? DEFAULT_FOLLOW_UP_MONTHS,
  );

  if (contract.status === 'cancelled') return null;

  if (contract.status === 'signed') {
    return viewer === 'organization'
      ? {
          title: 'El contrato quedó firmado por todos. Esto es lo que sigue',
          steps: [
            { text: 'Cada parte recibió su copia del contrato por correo.', done: true },
            {
              text: `Acuerda con el adoptante el día y el lugar para entregar a ${animal}.`,
              done: false,
            },
            {
              text: `Ese día, abre «Entregar a ${animal}» más abajo: toma la foto y muéstrale el código al adoptante para que confirme.`,
              done: false,
            },
            {
              text: `Al confirmar, ${animal} queda como adoptado y sus seguimientos se programan solos: ${contacts}.`,
              done: false,
            },
          ],
        }
      : {
          title: `¡Listo! El contrato quedó firmado. Esto es lo que sigue con ${animal}`,
          steps: [
            {
              text: 'Te enviamos tu copia del contrato al correo. También puedes descargarla aquí cuando quieras.',
              done: true,
            },
            {
              text: `La organización te contactará para acordar el día de la entrega de ${animal}.`,
              done: false,
            },
            {
              text: 'Ese día, con tu sesión abierta, escanea el código que te muestren (o escribe el que te llega por correo) para confirmar que lo recibiste.',
              done: false,
            },
            {
              text: `Desde ese momento tendrás la ficha digital de ${animal} en «Mis animales», y te pediremos contarnos cómo va ${contacts}, en «Mis seguimientos».`,
              done: false,
            },
          ],
        };
  }

  if (contract.status === 'pending_signatures') {
    return viewer === 'organization'
      ? {
          title: 'El contrato está esperando la firma del adoptante',
          steps: [
            { text: 'La organización ya firmó y el contrato se envió a firmas.', done: true },
            { text: 'El adoptante lo abre desde su cuenta, lo lee y firma.', done: false },
            {
              text: `Cuando firme, cada parte recibe su copia y podrás entregar a ${animal}.`,
              done: false,
            },
          ],
        }
      : {
          title: opts.viewerHasSigned
            ? 'Ya firmaste. Falta la firma de otra persona'
            : 'Te falta un paso: firmar el contrato',
          steps: [
            { text: 'La organización ya revisó y firmó este contrato.', done: true },
            {
              text: 'Léelo con calma y firma más abajo, dibujando tu firma o subiendo una foto de ella.',
              done: opts.viewerHasSigned,
            },
            {
              text: `Cuando estén todas las firmas te llega tu copia por correo y coordinan la entrega de ${animal}.`,
              done: false,
            },
          ],
        };
  }

  // Borrador.
  return viewer === 'organization'
    ? {
        title: 'Para enviar este contrato al adoptante',
        steps: [
          { text: 'Completa y guarda los datos marcados con * .', done: opts.dataComplete },
          {
            text: 'Quien representa a la organización lo aprueba y firma desde su cuenta.',
            done: representativeSigned,
          },
          {
            text: 'Envíalo a firmas: el adoptante lo verá en su cuenta para firmarlo.',
            done: false,
          },
        ],
      }
    : {
        title: 'La organización está preparando tu contrato',
        steps: [
          {
            text: 'La organización completa los datos y firma primero.',
            done: representativeSigned,
          },
          { text: 'Cuando te lo envíen, podrás leerlo y firmarlo aquí mismo.', done: false },
        ],
      };
}
