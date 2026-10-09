import {
  currentLegalAcceptanceItems,
  LEGAL_CONSENT_GROUPS,
  type LegalAcceptanceItem,
  type LegalConsentGroup,
} from '@adoptafacil/contracts';

/** Quién ve las casillas: una cuenta de persona, una de organización o un
 *  donante sin cuenta (que no ve la autorización comercial). */
export type ConsentAudience = 'person' | 'organization' | 'guest';

export type ConsentState = Partial<Record<LegalConsentGroup['id'], boolean>>;

/** Casillas que corresponden a cada público, en orden. */
export function consentGroupsFor(audience: ConsentAudience): LegalConsentGroup[] {
  return LEGAL_CONSENT_GROUPS.filter(
    (g) =>
      (!g.organizationOnly || audience === 'organization') && (!g.optional || audience !== 'guest'),
  );
}

/** Si están marcadas todas las casillas obligatorias. */
export function requiredConsentsGiven(audience: ConsentAudience, state: ConsentState): boolean {
  return consentGroupsFor(audience).every((g) => g.optional || state[g.id] === true);
}

/** Documentos (con su versión vigente) que se envían a la API. */
export function acceptancesFrom(
  audience: ConsentAudience,
  state: ConsentState,
): LegalAcceptanceItem[] {
  const keys = consentGroupsFor(audience)
    .filter((g) => state[g.id] === true)
    .flatMap((g) => g.documents);
  return currentLegalAcceptanceItems(keys);
}
