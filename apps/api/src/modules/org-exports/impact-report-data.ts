/**
 * Cifras del reporte de impacto (planes Crece y Pro): un PDF para donantes, empresas y la
 * junta, con lo que la organización logró en un período. Solo CIFRAS
 * AGREGADAS de los registros de la propia organización: nunca el nombre, el
 * contacto ni el documento de un adoptante, donante o voluntario, y ninguna
 * fila por persona. Es un documento informativo: no es certificado de donación
 * ni tiene efecto tributario (eso lo emiten los reportes firmados de M13).
 */

export interface ImpactCampaign {
  title: string;
  category: string;
  status: string;
  goalAmount: number;
  raisedAmount: number;
}

export interface ImpactReportData {
  organization: { name: string; city?: string };
  /** `YYYY-MM-DD` en hora de Colombia, inclusivas. */
  period: { start: string; end: string };
  generatedAt: Date;
  /** Animales registrados en el período (ingresos/rescates). */
  animalsRegistered: number;
  /** Contratos de adopción firmados en el período. */
  adoptionsCompleted: number;
  /** Donaciones aprobadas en el período: cantidad, neto para la org y donantes distintos. */
  donations: { count: number; netTotal: number; donors: number };
  /** Atenciones veterinarias del período por tipo (vacunas, esterilizaciones…). */
  care: { vaccines: number; sterilizations: number; surgeries: number; treatments: number };
  volunteerHours: number;
  volunteers: number;
  /** Campañas con actividad en el período (creadas antes de terminar y vigentes al iniciar). */
  campaigns: ImpactCampaign[];
  /** Cómo están hoy los animales activos de la organización. */
  animalsToday: { available: number; inProcess: number; adopted: number };
  /** Portal público de la organización (para el QR), si tiene slug. */
  portalUrl?: string;
}
