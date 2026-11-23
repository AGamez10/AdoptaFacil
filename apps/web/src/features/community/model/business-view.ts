import {
  BusinessBenefitStatus,
  formatBenefitPassCode,
  type AllyStep,
  type BusinessImpact,
} from '@adoptafacil/contracts';

/** Pasos del camino al sello, en palabras del negocio. */
export const ALLY_STEP_COPY: Record<AllyStep['key'], { title: string; hint: string }> = {
  profile_approved: {
    title: 'Tu perfil está publicado',
    hint: 'Lo revisamos y aparece en el directorio de servicios.',
  },
  first_contribution: {
    title: 'Hiciste tu primer aporte a un refugio',
    hint: 'Ofrece algo en el Banco de recursos. Cuenta cuando el refugio confirma que lo recibió.',
  },
  benefit_live: {
    title: 'Tienes un beneficio para quien adopta',
    hint: 'Publica uno y, cuando lo aprobemos, quien adopte lo verá en su cuenta.',
  },
};

export const BENEFIT_STATUS_LABELS: Record<BusinessBenefitStatus, string> = {
  [BusinessBenefitStatus.Pending]: 'En revisión',
  [BusinessBenefitStatus.Approved]: 'Publicado',
  [BusinessBenefitStatus.Rejected]: 'No aprobado',
  [BusinessBenefitStatus.Hidden]: 'Retirado',
};

export const BENEFIT_STATUS_VARIANT = {
  [BusinessBenefitStatus.Pending]: 'warning',
  [BusinessBenefitStatus.Approved]: 'success',
  [BusinessBenefitStatus.Rejected]: 'destructive',
  [BusinessBenefitStatus.Hidden]: 'secondary',
} as const;

/** Ideas para empezar (el negocio las ajusta a lo que de verdad ofrece). */
export const BENEFIT_IDEAS = [
  'Primera consulta gratis para animales adoptados',
  '15 % en el primer baño y corte',
  'Kit de bienvenida para el nuevo integrante',
  'Primer paseo sin costo',
] as const;

/** Impacto en una frase para el público ("Ha apoyado a 3 refugios…"). */
export function impactSentence(impact: BusinessImpact | null | undefined): string | null {
  if (!impact) return null;
  const parts: string[] = [];
  if (impact.sheltersSupported > 0) {
    parts.push(
      impact.sheltersSupported === 1
        ? 'ha apoyado a 1 refugio'
        : `ha apoyado a ${impact.sheltersSupported} refugios`,
    );
  }
  if (impact.adoptersBenefited > 0) {
    parts.push(
      impact.adoptersBenefited === 1
        ? '1 familia adoptante usó su beneficio'
        : `${impact.adoptersBenefited} familias adoptantes usaron su beneficio`,
    );
  }
  if (parts.length === 0) return null;
  const text = parts.join(' y ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Mientras escribe: mayúsculas, sin ambigüedades y con guion a la mitad. */
export function typingPassCode(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export { formatBenefitPassCode };

/** `YYYY-MM` → "marzo de 2026". */
export function monthLabel(yyyyMm: string | undefined): string {
  if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) return '';
  const [year, month] = yyyyMm.split('-').map(Number);
  const label = new Intl.DateTimeFormat('es-CO', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
  return `${label} de ${year}`;
}

/** `YYYY-MM-DD` → "31 de diciembre de 2026". */
export function dayLabel(ymd: string | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [year, month, day] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
