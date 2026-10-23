/**
 * Etiquetas en español de los valores guardados (códigos estables en inglés).
 * Las comparten la exportación a Excel y el reporte de impacto, para que un
 * mismo estado se llame igual en los dos documentos. Un código desconocido se
 * muestra tal cual (nunca se pierde un dato por falta de traducción).
 */
export const SPECIES_LABEL: Record<string, string> = { dog: 'Perro', cat: 'Gato', other: 'Otro' };

export const SEX_LABEL: Record<string, string> = {
  male: 'Macho',
  female: 'Hembra',
  unknown: 'Sin definir',
};

export const SIZE_LABEL: Record<string, string> = {
  small: 'Pequeño',
  medium: 'Mediano',
  large: 'Grande',
};

export const ANIMAL_STATUS_LABEL: Record<string, string> = {
  available: 'Disponible',
  in_process: 'En proceso',
  adopted: 'Adoptado',
  unavailable: 'No disponible',
  deceased: 'Fallecido',
};

export const ADOPTION_STATUS_LABEL: Record<string, string> = {
  new: 'Nueva',
  in_review: 'En evaluación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  pending_signatures: 'Esperando firmas',
  signed: 'Firmado',
  cancelled: 'Cancelado',
};

export const CAMPAIGN_CATEGORY_LABEL: Record<string, string> = {
  medications: 'Medicamentos',
  food: 'Alimento',
  surgeries: 'Cirugías',
  sterilizations: 'Esterilizaciones',
  infrastructure: 'Infraestructura',
  emergencies: 'Emergencias',
};

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  closed: 'Finalizada',
  cancelled: 'Cancelada',
};

export const DONATION_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  declined: 'Rechazada',
};

export const DONATION_CONCEPT_LABEL: Record<string, string> = {
  organization: 'La organización',
  animal: 'Un animal',
  campaign: 'Una campaña',
};

export const OPPORTUNITY_STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  closed: 'Cerrada',
};

export function labelOf(map: Record<string, string>, code: string | null | undefined): string {
  if (!code) return '';
  return map[code] ?? code;
}
