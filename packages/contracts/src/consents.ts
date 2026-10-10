// Module: consents (consentimiento de terceros para reportes y certificados)
//
// Una persona (donante, voluntario) solo aparece identificada en un documento
// emitido por una organización si autorizó ESA organización para ESA finalidad.
// El registro guarda la versión y la huella (SHA-256) del texto que aceptó; una
// prueba compara la huella con el texto de este archivo, así que cambiar una
// letra exige publicar una versión nueva. Texto en BORRADOR sujeto a abogado y
// a la redacción del hilo de Blindaje legal (TODO(client)).

/** Finalidades que una persona puede autorizar. */
export type ThirdPartyConsentPurpose = 'org_report_identification';

/** Por dónde se otorgó. */
export type ThirdPartyConsentChannel = 'preferences' | 'volunteer_enrollment' | 'donation';

export interface ThirdPartyConsentText {
  purpose: ThirdPartyConsentPurpose;
  title: string;
  /** Fecha de la versión (YYYY-MM-DD). */
  version: string;
  /** SHA-256 (hex) de `text`, codificado en UTF-8. */
  sha256: string;
  text: string;
  /** Mientras sea `true`, la web muestra el aviso de borrador sujeto a abogado. */
  draft: boolean;
}

export const THIRD_PARTY_CONSENT_TEXTS: Readonly<
  Record<ThirdPartyConsentPurpose, ThirdPartyConsentText>
> = {
  org_report_identification: {
    purpose: 'org_report_identification',
    title: 'Uso de mi nombre y documento en reportes y certificados',
    version: '2026-10-10',
    sha256: 'a802e0ab53e0630a2dc571568c4afb5617e9139cb0177e5436f8550677d865f9',
    text: 'Autorizo a la organización seleccionada a incluir mi nombre y mi número de documento (parcialmente oculto) en los reportes y certificados que emita con base en mis donaciones o mi voluntariado con ella. Sin esta autorización, aparezco solo como "Donante" o no aparezco. Puedo revocarla cuando quiera desde "Uso de mis datos en reportes"; la revocación vale hacia adelante y no altera los documentos ya emitidos. AdoptaFácil solo facilita este registro: la organización es la responsable del tratamiento de mis datos en cada documento.',
    draft: true,
  },
};

/** Una organización con la que la persona tiene relación y el estado de su consentimiento. */
export interface ThirdPartyConsentItem {
  organizationId: string;
  organizationName: string;
  purpose: ThirdPartyConsentPurpose;
  authorized: boolean;
  textVersion?: string;
  /** ISO-8601 UTC. */
  grantedAt?: string;
}

/** `GET /me/consents`. */
export interface ThirdPartyConsentStatus {
  items: ThirdPartyConsentItem[];
  texts: ThirdPartyConsentText[];
}

/** `POST /me/consents`. */
export interface GrantThirdPartyConsentInput {
  organizationId: string;
  purpose: ThirdPartyConsentPurpose;
  /** Versión del texto que la persona vio; debe ser la vigente. */
  version: string;
}

/** `POST /me/consents/revoke`. */
export interface RevokeThirdPartyConsentInput {
  organizationId: string;
  purpose: ThirdPartyConsentPurpose;
}

/** Cuántas personas de la organización autorizaron el uso de sus datos (solo conteos). */
export interface OrgThirdPartyConsentSummary {
  registryAvailable: boolean;
  volunteers: { total: number; authorized: number };
  donors: { total: number; authorized: number };
}
