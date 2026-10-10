import { BadRequestException } from '@nestjs/common';

/** Colombia no tiene horario de verano: siempre UTC-5. */
const COLOMBIA_OFFSET_HOURS = 5;

/** Un reporte cubre como máximo un año (366 días, por los bisiestos). */
export const MAX_REPORT_PERIOD_DAYS = 366;

export interface ReportPeriod {
  /** `YYYY-MM-DD` tal como lo pidió el usuario (hora de Colombia). */
  startDate: string;
  endDate: string;
  /** Límites UTC equivalentes: [fromUtc, toUtcExclusive). */
  fromUtc: Date;
  toUtcExclusive: Date;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(value: string, label: string): { y: number; m: number; d: number } {
  const match = DATE_RE.exec(value);
  if (!match) {
    throw new BadRequestException(`La fecha ${label} debe tener el formato AAAA-MM-DD.`);
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new BadRequestException(`La fecha ${label} no existe en el calendario.`);
  }
  return { y, m, d };
}

/** Hoy en Colombia, `YYYY-MM-DD`. */
export function todayInColombia(now = new Date()): string {
  const shifted = new Date(now.getTime() - COLOMBIA_OFFSET_HOURS * 3600_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Valida y convierte un período de fechas de Colombia (inclusivas) a límites
 * UTC. Rechaza fechas inexistentes, períodos invertidos, períodos de más de un
 * año y fechas finales en el futuro (un reporte describe hechos ocurridos).
 */
export function resolveReportPeriod(
  startDate: string,
  endDate: string,
  now = new Date(),
): ReportPeriod {
  const start = parseDay(startDate, 'inicial');
  const end = parseDay(endDate, 'final');
  const fromUtc = new Date(Date.UTC(start.y, start.m - 1, start.d, COLOMBIA_OFFSET_HOURS));
  const toUtcExclusive = new Date(Date.UTC(end.y, end.m - 1, end.d + 1, COLOMBIA_OFFSET_HOURS));
  if (fromUtc >= toUtcExclusive) {
    throw new BadRequestException('La fecha inicial debe ser anterior o igual a la final.');
  }
  const days = Math.round((toUtcExclusive.getTime() - fromUtc.getTime()) / 86_400_000);
  if (days > MAX_REPORT_PERIOD_DAYS) {
    throw new BadRequestException('El período de un reporte no puede superar un año.');
  }
  if (endDate > todayInColombia(now)) {
    throw new BadRequestException('La fecha final no puede estar en el futuro.');
  }
  return { startDate, endDate, fromUtc, toUtcExclusive };
}
