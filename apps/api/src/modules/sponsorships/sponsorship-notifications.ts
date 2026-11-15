/** Pure email-copy builders for the recurring-billing ladder (S-5-REDISEÑO,
 *  M07/RF17) — mirrors the style of `volunteering/volunteer-notifications.ts`. */

interface ChargeInput {
  organizationName: string;
  animalName: string;
  amount: number;
}

export function buildChargeSubject(): string {
  return 'Nuevo cobro de tu apadrinamiento';
}

export function buildChargeBody(input: ChargeInput): string {
  return `Ya puedes pagar este mes de tu apadrinamiento de ${input.animalName} en ${input.organizationName} (${input.amount} COP). Entra a "Mis apadrinamientos" y toca "Pagar este mes": el dinero llega directo a la organización.`;
}

interface ReminderInput extends ChargeInput {
  isFinal: boolean;
}

export function buildReminderSubject(input: ReminderInput): string {
  return input.isFinal
    ? 'Último aviso: tu apadrinamiento será suspendido'
    : 'Recordatorio: pago de apadrinamiento pendiente';
}

export function buildReminderBody(input: ReminderInput): string {
  const base = `Tu pago del apadrinamiento de ${input.animalName} en ${input.organizationName} (${input.amount} COP) sigue pendiente. Págalo desde "Mis apadrinamientos" con "Pagar este mes".`;
  return input.isFinal
    ? `${base} Si no se completa pronto, el apadrinamiento se suspenderá automáticamente.`
    : base;
}

interface SuspensionInput {
  organizationName: string;
  animalName: string;
}

export function buildSuspensionSponsorSubject(): string {
  return 'Tu apadrinamiento fue suspendido por pago fallido';
}

export function buildSuspensionSponsorBody(input: SuspensionInput): string {
  return `Tu apadrinamiento de ${input.animalName} en ${input.organizationName} fue suspendido automáticamente: se agotaron los 3 intentos de cobro. Puedes reactivarlo generando un nuevo pago desde "Mis apadrinamientos".`;
}

export function buildSuspensionOrgSubject(): string {
  return 'Un apadrinamiento fue suspendido por pago fallido';
}

export function buildSuspensionOrgBody(input: SuspensionInput): string {
  return `El apadrinamiento de ${input.animalName} fue suspendido automáticamente por pago fallido (3 intentos agotados).`;
}
