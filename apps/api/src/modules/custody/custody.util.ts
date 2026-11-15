import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Fechas, dinero y textos comunes de los documentos de custodia. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Hoy en Colombia (`YYYY-MM-DD`): los vencimientos son fechas locales. */
export function todayInColombia(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** `YYYY-MM-DD` → Date a medianoche UTC (así se guarda una columna DATE). */
export function toDbDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function fromDbDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toDbDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDbDate(d);
}

/** Suma meses conservando el día cuando existe (31 ene + 1 mes = 28/29 feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, day] = date.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return fromDbDate(first);
}

export function formatCop(amount: number): string {
  return `$${Math.round(amount).toLocaleString('es-CO')}`;
}

/** "6 de noviembre de 2026" a partir de `YYYY-MM-DD`. */
export function formatDateLong(date: string): string {
  return toDbDate(date).toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** "06/11/2026" a partir de `YYYY-MM-DD`. */
export function formatDateShort(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** Instante UTC → "6 de noviembre de 2026, 3:40 p. m." en hora de Colombia. */
export function formatInstant(instant: Date): string {
  return instant.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function generatedLabel(now = new Date()): string {
  return `Generado el ${formatInstant(now)} (hora de Colombia)`;
}

export const SPECIES_LABELS: Record<string, string> = {
  dog: 'Perro',
  cat: 'Gato',
  other: 'Otra especie',
};

export const SEX_LABELS: Record<string, string> = {
  male: 'Macho',
  female: 'Hembra',
  unknown: 'Sin determinar',
};

export const ANIMAL_STATUS_LABELS: Record<string, string> = {
  available: 'Disponible',
  in_process: 'En proceso de adopción',
  adopted: 'Adoptado',
  unavailable: 'No disponible',
  deceased: 'Fallecido',
};

export function ageLabel(
  age: { years: number; months: number; approximate: boolean } | undefined | null,
): string {
  if (!age) return 'Sin registrar';
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} ${age.years === 1 ? 'año' : 'años'}`);
  if (age.months > 0) parts.push(`${age.months} ${age.months === 1 ? 'mes' : 'meses'}`);
  const text = parts.join(' y ') || 'Menos de un mes';
  return age.approximate ? `${text} (aprox.)` : text;
}

/** Código corto y legible de un animal (los 8 primeros caracteres de su id). */
export function animalCode(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function requireOrg(organizationId: string | undefined | null): string {
  if (!organizationId) throw new ForbiddenException('Missing tenant context');
  return organizationId;
}

/** Nombre visible de quien actúa, para dejarlo escrito en el registro. */
export async function actorNameOf(tx: Prisma.TransactionClient, userId: string): Promise<string> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  return user?.displayName?.trim() || 'Integrante del equipo';
}

/** Texto opcional: recortado, y `null` si quedó vacío. */
export function orNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
