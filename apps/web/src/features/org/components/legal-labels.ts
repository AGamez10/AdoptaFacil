import { DocumentType, FormalizationState, OrganizationCapability } from '@adoptafacil/contracts';

/** Nombres en lenguaje de refugio, compartidos por el panel de la organización
 *  y la revisión de plataforma. */
export const STATE_NAMES: Record<FormalizationState, string> = {
  [FormalizationState.Informal]: 'Informal',
  [FormalizationState.EnProceso]: 'En proceso',
  [FormalizationState.Formalizada]: 'Formalizada',
  [FormalizationState.ESAL]: 'ESAL',
  [FormalizationState.ESAL_RTE]: 'ESAL con RTE',
};

export const CAPABILITY_NAMES: Record<OrganizationCapability, string> = {
  [OrganizationCapability.PublicPortal]: 'Portal público y adopciones',
  [OrganizationCapability.AdoptionContracts]: 'Contrato de adopción',
  [OrganizationCapability.ReceiveDonations]: 'Recibir donaciones en tu cuenta',
  [OrganizationCapability.FundraisingCampaigns]: 'Campañas con meta',
  [OrganizationCapability.Sponsorships]: 'Apadrinamientos',
  [OrganizationCapability.DonationReceipt]: 'Comprobante de donación',
  [OrganizationCapability.VolunteerConstancy]: 'Constancia de voluntariado',
  [OrganizationCapability.VerifiedBadge]: 'Sello "Verificada" en tu portal',
  [OrganizationCapability.MarketplaceSales]: 'Vender en la tienda',
  [OrganizationCapability.DonationAccountingCertificate]:
    'Certificado de donación (soporte contable)',
  [OrganizationCapability.DonationTaxCertificate]:
    'Certificado de donación con beneficio tributario',
};

export const DOCUMENT_NAMES: Record<string, string> = {
  [DocumentType.Rut]: 'RUT',
  [DocumentType.ExistenceRepresentationCertificate]:
    'Certificado de existencia y representación legal',
  [DocumentType.LegalRepresentativeId]: 'Cédula del representante legal',
  [DocumentType.Other]: 'Otro documento',
};
