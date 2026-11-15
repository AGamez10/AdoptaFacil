import type { AdoptionDelivery } from '@adoptafacil/contracts';
import { RECORD_CLINICAL_LABELS, formatBogotaDate, upcomingDoses } from './adoptions-delivery-view';

const SPECIES_LABELS: Record<string, string> = { dog: 'Perro', cat: 'Gato', other: 'Mascota' };

export function recordSpeciesLabel(species: string): string {
  return SPECIES_LABELS[species] ?? 'Mascota';
}

/** Edad de hoy a partir de la ficha sellada: "3 años", "8 meses" o `null`. */
export function recordAgeLabel(
  delivery: Pick<AdoptionDelivery, 'record' | 'confirmedAt' | 'createdAt'>,
  now: Date = new Date(),
): string | null {
  const { birthDate, approximateAgeMonths } = delivery.record.animal;
  let months: number | null = null;
  if (birthDate) {
    const born = new Date(birthDate);
    if (!Number.isNaN(born.getTime())) {
      months = (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth());
      if (now.getDate() < born.getDate()) months -= 1;
    }
  } else if (typeof approximateAgeMonths === 'number') {
    // La edad aproximada se tomó al entregar: se le suma el tiempo que lleva en casa.
    const since = new Date(delivery.confirmedAt ?? delivery.createdAt);
    const elapsed = Number.isNaN(since.getTime())
      ? 0
      : (now.getFullYear() - since.getFullYear()) * 12 + (now.getMonth() - since.getMonth());
    months = approximateAgeMonths + Math.max(0, elapsed);
  }
  if (months === null || months < 0) return null;
  const prefix = birthDate ? '' : 'Unos ';
  if (months < 12) return `${prefix}${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `${prefix}${years} ${years === 1 ? 'año' : 'años'}`;
}

/** Resumen corto para compartir por mensajería (sin datos personales). */
export function recordShareText(delivery: AdoptionDelivery): string {
  const { record } = delivery;
  const lines = [`${record.animal.name} · ficha digital en AdoptaFácil`];
  if (delivery.confirmedAt) {
    lines.push(`En casa desde el ${formatBogotaDate(delivery.confirmedAt)}`);
  }
  lines.push(`Adoptado con ${record.organizationName}`);
  const next = upcomingDoses(record)[0];
  if (next) {
    lines.push(
      `Próxima dosis: ${RECORD_CLINICAL_LABELS[next.type] ?? next.type}, ${formatBogotaDate(next.dueAt)}`,
    );
  }
  return lines.join('\n');
}

const icsEscape = (text: string): string =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');

const icsDate = (iso: string): string => iso.slice(0, 10).replace(/-/g, '');

/**
 * Las próximas dosis como archivo de calendario (.ics), para agregarlas al
 * calendario del celular con un recordatorio una semana antes. `null` si no
 * hay ninguna próxima dosis.
 */
export function dosesToIcs(delivery: AdoptionDelivery, now: Date = new Date()): string | null {
  const doses = upcomingDoses(delivery.record).filter((d) => !Number.isNaN(Date.parse(d.dueAt)));
  if (doses.length === 0) return null;
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const events = doses.flatMap((dose, index) => {
    const day = icsDate(new Date(dose.dueAt).toISOString());
    const label = RECORD_CLINICAL_LABELS[dose.type] ?? 'Cuidado';
    return [
      'BEGIN:VEVENT',
      `UID:${delivery.id}-${index}-${day}@adoptafacil`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `SUMMARY:${icsEscape(`${label} de ${delivery.record.animal.name}`)}`,
      `DESCRIPTION:${icsEscape('Recordatorio de la ficha digital de AdoptaFácil.')}`,
      'BEGIN:VALARM',
      'TRIGGER:-P7D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(`${label} de ${delivery.record.animal.name} en una semana`)}`,
      'END:VALARM',
      'END:VEVENT',
    ];
  });
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AdoptaFacil//Ficha digital//ES',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}
