import {
  ADOPTION_STATUS_LABEL,
  ANIMAL_STATUS_LABEL,
  SPECIES_LABEL,
  labelOf,
} from './export-labels';
import type { DataExportInput } from './data-export-xlsx';

/**
 * Cifras del tablero ("Panel") de la exportación de datos. Todo sale de las
 * mismas filas que van en las hojas de detalle, así que el tablero y el detalle
 * nunca se contradicen. Son funciones puras: se prueban sin armar un Excel.
 *
 * Solo se cuenta lo que la plataforma mide hoy. Las visitas al portal y los
 * clics a WhatsApp NO se registran todavía (no hay evento que contar), así que
 * no aparecen aquí: mostrar un cero inventado sería peor que no mostrarlo.
 */

export interface Bar {
  label: string;
  value: number;
}

export interface PanelMetrics {
  animals: { total: number; active: number; adopted: number; byStatus: Bar[]; bySpecies: Bar[] };
  adoptions: {
    total: number;
    approved: number;
    contractsSigned: number;
    /** Aprobadas sobre las ya resueltas (aprobadas + rechazadas); null sin resueltas. */
    approvalRate: number | null;
    byStatus: Bar[];
  };
  donations: {
    /** Aprobadas y no reversadas. */
    paidCount: number;
    reversedCount: number;
    pendingCount: number;
    grossCop: number;
    netCop: number;
    feesCop: number;
    /** Neto por mes (`YYYY-MM`, hora de Colombia), de más antiguo a más reciente. */
    netByMonth: Bar[];
    countByMonth: Bar[];
  };
  campaigns: {
    total: number;
    active: number;
    goalCop: number;
    raisedCop: number;
    /** Recaudado sobre meta, 0-100; null si no hay metas. */
    progressPct: number | null;
    rows: Array<{ label: string; goal: number; raised: number; pct: number }>;
  };
  volunteering: {
    opportunities: number;
    active: number;
    volunteers: number;
    hours: number;
    hoursByOpportunity: Bar[];
  };
  store: {
    products: number;
    active: number;
    outOfStock: number;
    stockUnits: number;
    byCategory: Bar[];
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Cuenta por etiqueta, de mayor a menor (empate: orden alfabético, estable). */
function countBy<T>(rows: readonly T[], key: (row: T) => string): Bar[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = key(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'));
}

/** `YYYY-MM` en hora de Colombia (UTC-5, sin horario de verano). */
export function colombiaMonth(date: Date): string {
  return new Date(date.getTime() - 5 * 3600_000).toISOString().slice(0, 7);
}

export function buildPanelMetrics(input: DataExportInput): PanelMetrics {
  const animals = input.animals;
  const adoptions = input.adoptions;

  const resolved = adoptions.filter((a) => a.status === 'approved' || a.status === 'rejected');
  const approved = adoptions.filter((a) => a.status === 'approved').length;

  const paid = input.donations.filter((d) => d.status === 'approved' && !d.reversedReason);
  const months = new Map<string, { net: number; count: number }>();
  for (const d of paid) {
    const month = colombiaMonth(d.approvedAt);
    const entry = months.get(month) ?? { net: 0, count: 0 };
    entry.net += d.net;
    entry.count += 1;
    months.set(month, entry);
  }
  const monthKeys = [...months.keys()].sort();

  const goalCop = input.campaigns.reduce((sum, c) => sum + c.goalAmount, 0);
  const raisedCop = input.campaigns.reduce((sum, c) => sum + c.raisedAmount, 0);

  const hoursRows = input.opportunities
    .map((o) => ({ label: o.title, value: o.approvedHours }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'));

  const products = input.products ?? [];

  return {
    animals: {
      total: animals.length,
      active: animals.filter((a) => a.isActive).length,
      adopted: animals.filter((a) => a.status === 'adopted').length,
      byStatus: countBy(animals, (a) => labelOf(ANIMAL_STATUS_LABEL, a.status)),
      bySpecies: countBy(animals, (a) => labelOf(SPECIES_LABEL, a.species)),
    },
    adoptions: {
      total: adoptions.length,
      approved,
      contractsSigned: adoptions.filter((a) => a.contractStatus === 'signed').length,
      approvalRate: resolved.length > 0 ? round2((approved / resolved.length) * 100) : null,
      byStatus: countBy(adoptions, (a) => labelOf(ADOPTION_STATUS_LABEL, a.status)),
    },
    donations: {
      paidCount: paid.length,
      reversedCount: input.donations.filter((d) => d.reversedReason).length,
      pendingCount: input.donations.filter((d) => d.status === 'pending').length,
      grossCop: paid.reduce((sum, d) => sum + d.amountCharged, 0),
      netCop: paid.reduce((sum, d) => sum + d.net, 0),
      feesCop: paid.reduce((sum, d) => sum + d.gatewayFee + d.gatewayIva, 0),
      netByMonth: monthKeys.map((label) => ({ label, value: months.get(label)!.net })),
      countByMonth: monthKeys.map((label) => ({ label, value: months.get(label)!.count })),
    },
    campaigns: {
      total: input.campaigns.length,
      active: input.campaigns.filter((c) => c.status === 'active').length,
      goalCop,
      raisedCop,
      progressPct: goalCop > 0 ? round2((raisedCop / goalCop) * 100) : null,
      rows: input.campaigns.map((c) => ({
        label: c.title,
        goal: c.goalAmount,
        raised: c.raisedAmount,
        pct: c.goalAmount > 0 ? round2((c.raisedAmount / c.goalAmount) * 100) : 0,
      })),
    },
    volunteering: {
      opportunities: input.opportunities.length,
      active: input.opportunities.filter((o) => o.status === 'active').length,
      volunteers: input.opportunities.reduce((sum, o) => sum + o.acceptedVolunteers, 0),
      hours: round2(input.opportunities.reduce((sum, o) => sum + o.approvedHours, 0)),
      hoursByOpportunity: hoursRows,
    },
    store: {
      products: products.length,
      active: products.filter((p) => p.isActive).length,
      outOfStock: products.filter((p) => p.isActive && p.stock === 0).length,
      stockUnits: products.reduce((sum, p) => sum + p.stock, 0),
      byCategory: countBy(products, (p) => p.category),
    },
  };
}
