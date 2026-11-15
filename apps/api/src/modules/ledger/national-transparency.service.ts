import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NationalTransparency } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/** Cuánto se reutiliza el consolidado: la landing lo pide en cada visita. */
const CACHE_MS = 60_000;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Transparencia Nacional (punto 22): el consolidado de los libros públicos de
 * TODAS las organizaciones aprobadas. Lee una sola función SECURITY DEFINER que
 * devuelve únicamente sumas y conteos (nunca filas ni datos personales) y la
 * guarda un minuto en memoria para que la landing no recalcule en cada visita.
 */
@Injectable()
export class NationalTransparencyService {
  private cache: { at: number; data: NationalTransparency } | null = null;
  private pending: Promise<NationalTransparency> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(now: number = Date.now()): Promise<NationalTransparency> {
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.data;
    if (!this.pending) {
      this.pending = this.load()
        .then((data) => {
          this.cache = { at: Date.now(), data };
          return data;
        })
        .finally(() => {
          this.pending = null;
        });
    }
    return this.pending;
  }

  private async load(): Promise<NationalTransparency> {
    const rows = await this.prisma.$queryRaw<Array<{ data: unknown }>>(
      Prisma.sql`SELECT public_national_transparency() AS data`,
    );
    return normalizeNational(rows[0]?.data ?? null);
  }
}

/** Forma estable (números como number, listas siempre presentes). */
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);

export function normalizeNational(data: unknown): NationalTransparency {
  const d = obj(data);
  const orgs = obj(d.organizations);
  const totals = obj(d.totals);
  const month = obj(d.thisMonth);
  const animals = obj(d.animals);
  return {
    generatedAt: typeof d.generatedAt === 'string' ? d.generatedAt : new Date().toISOString(),
    organizations: {
      approved: num(orgs.approved),
      reporting: num(orgs.reporting),
    },
    totals: {
      incomeCop: num(totals.incomeCop),
      expenseCop: num(totals.expenseCop),
      movementCount: num(totals.movementCount),
      onlineDonationsCop: num(totals.onlineDonationsCop),
      onlineDonationsCount: num(totals.onlineDonationsCount),
    },
    thisMonth: {
      month: String(month.month ?? ''),
      incomeCop: num(month.incomeCop),
      expenseCop: num(month.expenseCop),
      movementCount: num(month.movementCount),
      onlineDonationsCount: num(month.onlineDonationsCount),
    },
    months: list(d.months).map((m) => ({
      month: String(m.month),
      incomeCop: num(m.incomeCop),
      expenseCop: num(m.expenseCop),
    })),
    categories: list(d.categories).map((c) => ({
      kind: c.kind as NationalTransparency['categories'][number]['kind'],
      category: c.category as NationalTransparency['categories'][number]['category'],
      amountCop: num(c.amountCop),
    })),
    donationDestinations: list(d.donationDestinations).map((x) => ({
      destination:
        x.destination as NationalTransparency['donationDestinations'][number]['destination'],
      amountCop: num(x.amountCop),
      count: num(x.count),
    })),
    departments: list(d.departments).map((x) => ({
      department: typeof x.department === 'string' ? x.department : null,
      organizations: num(x.organizations),
      incomeCop: num(x.incomeCop),
      expenseCop: num(x.expenseCop),
    })),
    animals: {
      inAdoption: num(animals.inAdoption),
      adopted: num(animals.adopted),
    },
  };
}
