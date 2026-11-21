import type { Organization, OrganizationDashboardSummary } from '@adoptafacil/contracts';

export interface FirstStep {
  key: 'profile' | 'documents' | 'animal' | 'payments';
  title: string;
  description: string;
  href: string;
  linkLabel: string;
  done: boolean;
}

export interface FirstStepsInput {
  summary: OrganizationDashboardSummary;
  /** `GET /org/profile` (solo los campos que importan aquí). */
  profile: Pick<Organization, 'logoUrl' | 'description' | 'aboutUs'> | null;
  /** Estado de los cobros en línea; `null` si no aplica (módulo apagado o sin permiso). */
  payments: 'connected' | 'pending' | null;
  /** A dónde se conectan los cobros. */
  paymentsHref: string;
}

/**
 * "Primeros pasos" de un refugio recién registrado. Cada paso se marca hecho
 * SOLO con un dato real que ya existe (nada de casillas que la persona marca a
 * mano): perfil con logo y descripción, formalización por encima de "Informal",
 * al menos un animal publicado y, si hay pago en línea, cobros conectados.
 */
export function deriveFirstSteps(input: FirstStepsInput): FirstStep[] {
  const { summary, profile, payments, paymentsHref } = input;
  const hasText = (value?: string) => typeof value === 'string' && value.trim().length > 0;
  const steps: FirstStep[] = [
    {
      key: 'profile',
      title: 'Completa el perfil de tu refugio',
      description: 'Logo y descripción: es lo primero que ve quien quiere adoptar o donar.',
      href: '/organizacion',
      linkLabel: 'Completar perfil',
      done:
        !!profile &&
        hasText(profile.logoUrl) &&
        (hasText(profile.description) || hasText(profile.aboutUs)),
    },
    {
      key: 'documents',
      title: 'Sube tus documentos',
      description:
        'Te dan el sello de confianza en tu portal. Puedes empezar sin RUT: te guiamos paso a paso.',
      href: '/organizacion/documentos',
      linkLabel: 'Ir a documentos',
      done: summary.formalizationPercent > 0,
    },
    {
      key: 'animal',
      title: 'Publica tu primer animal',
      description: 'Con foto y su historia aparece en tu portal y en el catálogo de adopción.',
      href: '/animales',
      linkLabel: 'Publicar animal',
      done: summary.animalsActive > 0,
    },
  ];
  if (payments) {
    steps.push({
      key: 'payments',
      title: 'Conecta cómo recibir donaciones',
      description: 'El dinero llega directo a la cuenta de tu organización.',
      href: paymentsHref,
      linkLabel: 'Conectar cobros',
      done: payments === 'connected',
    });
  }
  return steps;
}
