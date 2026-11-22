import {
  currentLegalAcceptanceItems,
  requiredGuestLegalDocuments,
  requiredLegalDocuments,
} from '@adoptafacil/contracts';

/**
 * Aceptación legal obligatoria que el registro exige (Ley 1581). Las pruebas que
 * crean cuentas la envían igual que el formulario web: versión vigente de cada
 * documento obligatorio del tipo de cuenta.
 */
export const LEGAL_PERSON = {
  legalAcceptances: currentLegalAcceptanceItems(requiredLegalDocuments('person')),
};
export const LEGAL_ORG = {
  legalAcceptances: currentLegalAcceptanceItems(requiredLegalDocuments('organization')),
};
/** Lo que acepta quien entra por invitación con un cargo distinto de
 *  propietario: condiciones de miembro, nunca el contrato de la organización. */
export const LEGAL_MEMBER = {
  legalAcceptances: currentLegalAcceptanceItems(requiredLegalDocuments('member')),
};

/** Lo que acepta un donante sin cuenta en el formulario de donación. */
export const LEGAL_GUEST = {
  legalAcceptances: currentLegalAcceptanceItems(requiredGuestLegalDocuments()),
};
