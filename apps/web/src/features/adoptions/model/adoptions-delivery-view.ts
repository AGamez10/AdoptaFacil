import type {
  AdoptionAnimalRecord,
  AdoptionDeliveryItem,
  AnimalIdentificationType,
} from '@adoptafacil/contracts';

/** Lo que se entrega con el animal, en palabras de la persona. */
export const DELIVERY_ITEM_LABELS: Record<AdoptionDeliveryItem, string> = {
  vaccine_card: 'Carné de vacunas físico',
  food: 'Alimento',
  collar_leash: 'Collar y correa',
  bed: 'Cama o cobija',
  toys: 'Juguetes',
  medication: 'Medicamentos en curso',
  documents: 'Copia del contrato y documentos',
};

/** Tipos de evento clínico (valores de `ClinicalEventType`) para la ficha. */
export const RECORD_CLINICAL_LABELS: Record<string, string> = {
  vaccine: 'Vacuna',
  treatment: 'Tratamiento',
  surgery: 'Cirugía',
  sterilization: 'Esterilización',
  allergy: 'Alergia',
  disability: 'Discapacidad',
  medication: 'Medicamento',
  diagnosis: 'Diagnóstico',
};

export const IDENTIFICATION_LABELS: Record<AnimalIdentificationType, string> = {
  microchip: 'Microchip',
  tag: 'Placa',
  none: 'Sin identificación física',
};

/** Fecha sin hora, en hora Colombia. */
export function formatBogotaDate(isoUtc: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
  }).format(date);
}

/** "Vence en N min" a partir de la vigencia del código. */
export function minutesLeft(expiresAtIso: string | null, now: number = Date.now()): number {
  if (!expiresAtIso) return 0;
  return Math.max(0, Math.ceil((Date.parse(expiresAtIso) - now) / 60_000));
}

/** Vacunas con próxima dosis, la más cercana primero (lo que más importa en casa). */
export function upcomingDoses(record: AdoptionAnimalRecord): { type: string; dueAt: string }[] {
  return record.clinical
    .filter((c) => c.nextDueDate)
    .map((c) => ({ type: c.type, dueAt: c.nextDueDate as string }))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}
