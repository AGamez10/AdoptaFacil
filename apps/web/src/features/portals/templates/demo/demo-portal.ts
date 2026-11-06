import {
  CampaignCategory,
  CampaignStatus,
  FormalizationState,
  LedgerEntryKind,
  LedgerSource,
  OrganizationType,
  ProductCategory,
  ResourceCategory,
  ResourceNeedStatus,
  type AnimalSummary,
  type CampaignPublic,
  type OrganizationPublic,
  type ProductPublic,
  type PublicLedgerEntry,
  type PublicReview,
  type ResourceNeedPublic,
} from '@adoptafacil/contracts';
import type { TemplateSourceData } from '../engine/model';

/**
 * Datos de DEMOSTRACIÓN para la vista previa pública de las plantillas
 * (`/plantillas/:id`). Son inventados y viven solo en el navegador: no salen de
 * la API, no se guardan y no se mezclan con ninguna organización real. Los ids
 * llevan el prefijo `demo-` y el slug no puede existir en la base (los slugs
 * reales no aceptan `--`), así que ningún enlace resuelve a un portal real.
 */
export const DEMO_SLUG = 'ejemplo--adoptafacil';
const ORG_ID = 'demo-org';
const ORG_NAME = 'Fundación Huellas de Esperanza';

const DAY = 864e5;

type DemoAnimal = readonly [
  name: string,
  species: 'dog' | 'cat',
  sex: 'male' | 'female',
  size: 'small' | 'medium' | 'large',
  months: number,
  breed: string,
];

const ANIMALS: readonly DemoAnimal[] = [
  ['Canela', 'dog', 'female', 'medium', 26, 'Criolla'],
  ['Simón', 'cat', 'male', 'small', 14, 'Común europeo'],
  ['Toby', 'dog', 'male', 'small', 48, 'Mestizo'],
  ['Nina', 'cat', 'female', 'small', 7, 'Siamés mestiza'],
  ['Rocco', 'dog', 'male', 'large', 60, 'Pastor mestizo'],
  ['Luna', 'cat', 'female', 'small', 30, 'Angora mestiza'],
  ['Max', 'dog', 'male', 'medium', 18, 'Labrador mestizo'],
  ['Mora', 'cat', 'female', 'small', 4, 'Común europeo'],
  ['Kira', 'dog', 'female', 'large', 72, 'Criolla'],
  ['Tigre', 'cat', 'male', 'medium', 40, 'Atigrado'],
  ['Lola', 'dog', 'female', 'small', 9, 'Criolla'],
  ['Pelusa', 'cat', 'female', 'small', 96, 'Persa mestiza'],
  ['Bruno', 'dog', 'male', 'large', 36, 'Golden mestizo'],
  ['Mía', 'cat', 'female', 'small', 3, 'Carey'],
  ['Coco', 'dog', 'male', 'small', 110, 'Poodle mestizo'],
  ['Frida', 'cat', 'female', 'medium', 22, 'Común europeo'],
  ['Zeus', 'dog', 'male', 'large', 28, 'Criollo'],
  ['Oreo', 'cat', 'male', 'small', 11, 'Bicolor'],
  ['Maya', 'dog', 'female', 'medium', 5, 'Criolla'],
  ['Milo', 'cat', 'male', 'medium', 54, 'Naranja atigrado'],
  ['Sasha', 'dog', 'female', 'medium', 84, 'Beagle mestiza'],
  ['Nube', 'cat', 'female', 'small', 16, 'Blanca angora'],
  ['Tango', 'dog', 'male', 'medium', 13, 'Criollo'],
  ['Kiwi', 'cat', 'male', 'small', 6, 'Común europeo'],
];

function demoAnimals(now: number): AnimalSummary[] {
  return ANIMALS.map(([name, species, sex, size, months, breed], i) => ({
    id: `demo-animal-${i + 1}`,
    organizationId: ORG_ID,
    name,
    species,
    sex,
    size,
    status: 'available',
    breed,
    computedAge: {
      years: Math.floor(months / 12),
      months: months % 12,
      totalMonths: months,
      approximate: i % 4 === 0,
    },
    createdAt: new Date(now - ((i * 9) % 150) * DAY).toISOString(),
  }));
}

const ORGANIZATION: OrganizationPublic = {
  id: ORG_ID,
  name: ORG_NAME,
  slug: DEMO_SLUG,
  description: 'Rescatamos, cuidamos y buscamos familia para perros y gatos en Medellín.',
  location: { city: 'Medellín', department: 'Antioquia', country: 'Colombia' },
  socialLinks: {
    instagram: 'https://instagram.com/huellasdeesperanza.ejemplo',
    facebook: 'https://facebook.com/huellasdeesperanza.ejemplo',
    website: 'https://example.org',
  },
  whatsapp: '+57 300 000 0000',
  contactEmail: 'hola@example.org',
  formalizationState: FormalizationState.ESAL,
  rteVigente: true,
  verificationLevel: { level: 3, label: 'Confiable', criteria: [] },
  aboutUs:
    'Somos un equipo de voluntarias y veterinarios que desde 2016 rescata animales en situación de calle. Los curamos, los esterilizamos y los acompañamos hasta encontrar una familia responsable. Cada adopción tiene contrato, visita previa y seguimiento.',
  extendedContact: {
    hours: 'Lunes a sábado, 9:00 a. m. a 5:00 p. m.',
    fullAddress: 'Dirección de ejemplo, Medellín',
    additionalPhones: ['+57 300 000 0001'],
  },
  organizationType: OrganizationType.Foundation,
};

function demoCampaigns(now: number): CampaignPublic[] {
  const base = {
    organizationId: ORG_ID,
    organizationName: ORG_NAME,
    status: CampaignStatus.Active,
  };
  return [
    {
      ...base,
      id: 'demo-camp-1',
      title: 'Cirugía de cadera para Rocco',
      description: 'Rocco necesita una cirugía de cadera para volver a correr sin dolor.',
      category: CampaignCategory.Surgeries,
      goalAmount: 2_400_000,
      raisedAmount: 1_560_000,
      progress: 0.65,
      deadline: new Date(now + 24 * DAY).toISOString(),
      createdAt: new Date(now - 12 * DAY).toISOString(),
    },
    {
      ...base,
      id: 'demo-camp-2',
      title: 'Jornada de esterilización en Bello',
      description: 'Cincuenta esterilizaciones gratuitas para gatos y perros del barrio.',
      category: CampaignCategory.Sterilizations,
      goalAmount: 3_000_000,
      raisedAmount: 1_050_000,
      progress: 0.35,
      deadline: new Date(now + 40 * DAY).toISOString(),
      createdAt: new Date(now - 6 * DAY).toISOString(),
    },
    {
      ...base,
      id: 'demo-camp-3',
      title: 'Concentrado para el invierno',
      description: 'Alimento para todos los animales del hogar de paso durante tres meses.',
      category: CampaignCategory.Food,
      goalAmount: 1_800_000,
      raisedAmount: 1_530_000,
      progress: 0.85,
      deadline: new Date(now + 15 * DAY).toISOString(),
      createdAt: new Date(now - 20 * DAY).toISOString(),
    },
  ];
}

function demoNeeds(now: number): ResourceNeedPublic[] {
  const rows: Array<[string, ResourceCategory, number, number, string]> = [
    ['Concentrado para cachorros', ResourceCategory.Food, 200, 132, 'kg'],
    ['Antipulgas y desparasitantes', ResourceCategory.Medicine, 60, 41, 'dosis'],
    ['Arena para gatos', ResourceCategory.Supplies, 80, 26, 'kg'],
    ['Cobijas y camas', ResourceCategory.Supplies, 40, 11, 'unidades'],
  ];
  return rows.map(([title, category, need, got, unit], i) => ({
    id: `demo-need-${i + 1}`,
    organizationId: ORG_ID,
    organizationName: ORG_NAME,
    title,
    category,
    quantityNeeded: need,
    quantityFulfilled: got,
    unit,
    progress: got / need,
    status: ResourceNeedStatus.PartiallyFulfilled,
    createdAt: new Date(now - (i + 2) * DAY).toISOString(),
  }));
}

function demoProducts(now: number): ProductPublic[] {
  const rows: Array<[string, ProductCategory, number]> = [
    ['Collar artesanal', ProductCategory.Accessories, 25_000],
    ['Camiseta Huellas', ProductCategory.Accessories, 45_000],
    ['Shampoo suave', ProductCategory.Hygiene, 18_000],
    ['Pelota resistente', ProductCategory.Toys, 15_000],
  ];
  return rows.map(([name, category, price], i) => ({
    id: `demo-prod-${i + 1}`,
    organizationId: ORG_ID,
    organizationName: ORG_NAME,
    name,
    category,
    price,
    stock: 10,
    images: [],
    createdAt: new Date(now - (i + 1) * DAY).toISOString(),
  }));
}

function demoReviews(now: number): PublicReview[] {
  return [
    {
      id: 'demo-rev-1',
      rating: 5,
      comment: 'Nos acompañaron antes y después de adoptar a Canela. Todo fue claro.',
      authorName: 'Laura M.',
      createdAt: new Date(now - 18 * DAY).toISOString(),
    },
    {
      id: 'demo-rev-2',
      rating: 5,
      comment: 'Doné para una cirugía y me enviaron el certificado y fotos de la recuperación.',
      authorName: 'Andrés P.',
      createdAt: new Date(now - 45 * DAY).toISOString(),
    },
    {
      id: 'demo-rev-3',
      rating: 4,
      comment: 'Un equipo muy comprometido. La visita previa nos dio mucha tranquilidad.',
      createdAt: new Date(now - 80 * DAY).toISOString(),
    },
  ];
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function demoLedger(now: number): TemplateSourceData['ledger'] {
  const rows: Array<[LedgerEntryKind, PublicLedgerEntry['category'], number, string, number]> = [
    [LedgerEntryKind.Income, 'donacion_dinero', 850_000, 'Donaciones en línea de la semana', 2],
    [LedgerEntryKind.Expense, 'veterinaria', 420_000, 'Consulta y exámenes de Rocco', 4],
    [LedgerEntryKind.Expense, 'alimento', 380_000, 'Concentrado para el hogar de paso', 7],
    [LedgerEntryKind.Income, 'evento', 600_000, 'Bazar de adopción', 11],
    [LedgerEntryKind.Expense, 'esterilizacion', 300_000, 'Esterilización de Nina y Mora', 14],
  ];
  const items: PublicLedgerEntry[] = rows.map(([kind, category, amountCop, concept, ago], i) => ({
    id: `demo-ledger-${i + 1}`,
    source: i === 0 ? LedgerSource.OnlineDonation : LedgerSource.Manual,
    kind,
    category,
    occurredOn: isoDay(now - ago * DAY),
    amountCop,
    concept,
    hasSupport: true,
    createdAt: new Date(now - ago * DAY).toISOString(),
    voided: false,
  }));
  const incomeCop = 1_450_000;
  const expenseCop = 1_100_000;
  return {
    items,
    total: items.length,
    limit: items.length,
    offset: 0,
    totals: {
      incomeCop,
      expenseCop,
      balanceCop: incomeCop - expenseCop,
      entryCount: items.length,
      lastEntryOn: items[0].occurredOn,
    },
  };
}

/** Portal completo de ejemplo: todas las secciones con contenido. */
export function buildDemoSource(now: number = Date.now()): TemplateSourceData {
  const animals = demoAnimals(now);
  return {
    slug: DEMO_SLUG,
    organization: ORGANIZATION,
    animals,
    // Mismo número que las tarjetas: el titular nunca promete más animales de
    // los que el catálogo de la plantilla deja ver.
    animalTotal: animals.length,
    campaigns: demoCampaigns(now),
    needs: demoNeeds(now),
    products: demoProducts(now),
    reviews: demoReviews(now),
    ledger: demoLedger(now),
  };
}
