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
    title: 'Autorización para aparecer en reportes y certificados de una organización',
    version: '2026-10-10',
    sha256: '490ebdd71765955c098e24a2ca48b67f7fce888c90cfb14146b26aae567c8fd1',
    text: 'Esta autorización es opcional. No darla no me impide donar, apadrinar ni ser voluntario; en ese caso aparezco en los reportes sin mi nombre ni mi documento (como "Donante").\n\nAutorizo a la organización a la que estoy donando o con la que soy voluntario, responsable de mis datos en su relación conmigo, a mostrar mi nombre y mi número de documento parcialmente oculto (solo los últimos dígitos) en los reportes de transparencia y en los certificados que emita sobre mis donaciones, apadrinamientos o voluntariado.\n\nAdoptaFácil solo presta la herramienta con la que la organización genera esos reportes y certificados, y trata estos datos como encargado, por cuenta de la organización. AdoptaFácil no certifica la información que la organización publica.\n\nEsta autorización no permite usar mis datos con fines comerciales ni para entrenar inteligencia artificial; esos usos requieren autorizaciones separadas.\n\nPuedo retirarla cuando quiera desde "Uso de mis datos". El retiro aplica a los reportes y certificados que se generen después; los ya emitidos no se modifican.\n\nQueda registro de esta autorización y de su retiro: la versión de este texto, la fecha y hora (UTC) y la organización a la que la otorgué.',
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
