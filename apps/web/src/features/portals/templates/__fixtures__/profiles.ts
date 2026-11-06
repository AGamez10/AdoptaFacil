import {
  CampaignCategory,
  CampaignStatus,
  FormalizationState,
  OrganizationType,
  ProductCategory,
  ResourceCategory,
  ResourceNeedStatus,
  type AnimalSummary,
} from '@adoptafacil/contracts';
import type { TemplateSourceData } from '../engine/model';

/**
 * Perfiles de prueba de las plantillas (solo pruebas y vista previa local):
 *  - `completa`: ESAL verificada con todas las secciones llenas.
 *  - `nueva`: fundación sin formalizar, nivel 0, sin contacto, sin campaña.
 *  - `vacia`: organización recién creada, sin ningún dato publicado.
 *  - `hostil`: cada texto libre trae un intento de inyección (prueba XSS).
 */

const NOW = new Date('2026-10-23T15:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 864e5).toISOString();

const NAMES = [
  ['Luna', 'cat', 'female', 'small', 12, 'Mestiza'],
  ['Rocco', 'dog', 'male', 'large', 60, 'Mestizo'],
  ['Michu', 'cat', 'female', 'small', 24, 'Angora mestizo'],
  ['Firulais', 'dog', 'male', 'medium', 36, 'Criollo'],
  ['Kiara', 'dog', 'female', 'medium', 8, 'Criolla'],
  ['Garfield', 'cat', 'male', 'medium', 110, 'Común europeo'],
  ['Nala', 'dog', 'female', 'small', 4, ''],
  ['Simba', 'cat', 'male', 'small', 18, 'Siamés mestizo'],
  ['Thor', 'dog', 'male', 'large', 96, 'Pastor mestizo'],
  ['Pelusa', 'cat', 'female', 'small', 30, 'Persa mestizo'],
  ['Bruno', 'dog', 'male', 'medium', 48, 'Labrador mestizo'],
  ['Mora', 'cat', 'female', 'small', 6, 'Común europeo'],
] as const;

export function fixtureAnimals(n: number, orgId = 'org-1'): AnimalSummary[] {
  return Array.from({ length: n }, (_, i) => {
    const [name, species, sex, size, months, breed] = NAMES[i % NAMES.length];
    return {
      id: `animal-${i + 1}`,
      organizationId: orgId,
      name: i < NAMES.length ? name : `${name} ${Math.floor(i / NAMES.length) + 1}`,
      species,
      sex,
      size,
      status: 'available',
      breed: breed || undefined,
      computedAge: {
        years: Math.floor(months / 12),
        months: months % 12,
        totalMonths: months,
        approximate: i % 5 === 0,
      },
      createdAt: daysAgo((i * 7) % 90),
    };
  });
}

const ORG = {
  id: 'org-1',
  name: 'Refugio Patitas Felices',
  slug: 'patitas-felices',
  description: 'Rescatamos y encontramos hogar para perros y gatos en Bogotá.',
  location: { city: 'Bogotá', department: 'Cundinamarca', country: 'Colombia' },
  socialLinks: {
    instagram: 'https://instagram.com/patitasfelices',
    facebook: 'https://facebook.com/patitasfelices',
    tiktok: 'https://tiktok.com/@patitasfelices',
    website: 'https://patitasfelices.org',
  },
  whatsapp: '+57 310 555 0187',
  contactEmail: 'hola@patitasfelices.org',
  formalizationState: FormalizationState.ESAL,
  rteVigente: true,
  verificationLevel: { level: 3, label: 'Confiable', criteria: [] },
  aboutUs:
    'Rescatamos, rehabilitamos y encontramos hogar para perros y gatos en situación de calle en Bogotá. Cada adopción es un compromiso de por vida.',
  extendedContact: {
    hours: 'Lunes a sábado, 9:00 a. m. a 5:00 p. m.',
    fullAddress: 'Calle 72 # 20-35, Barrios Unidos',
    additionalPhones: ['601 555 0142', '310 555 0187'],
  },
  nit: '900.123.456-7',
  organizationType: OrganizationType.Shelter,
};

const CAMPAIGNS = [
  {
    id: 'camp-1',
    organizationId: 'org-1',
    organizationName: ORG.name,
    title: 'Cirugía de cadera para Rocco',
    description: 'Rocco necesita una cirugía de cadera para volver a caminar sin dolor.',
    category: CampaignCategory.Surgeries,
    goalAmount: 1500000,
    raisedAmount: 100000,
    progress: 100000 / 1500000,
    deadline: '2026-12-31T23:59:59Z',
    status: CampaignStatus.Active,
    createdAt: daysAgo(20),
  },
  {
    id: 'camp-2',
    organizationId: 'org-1',
    organizationName: ORG.name,
    title: 'Jornada de esterilización',
    category: CampaignCategory.Sterilizations,
    goalAmount: 800000,
    raisedAmount: 320000,
    progress: 0.4,
    deadline: '2026-11-30T23:59:59Z',
    status: CampaignStatus.Active,
    createdAt: daysAgo(10),
  },
];

const NEEDS = [
  ['Concentrado para cachorros', ResourceCategory.Food, 200, 124, 'kg'],
  ['Antipulgas y desparasitantes', ResourceCategory.Medicine, 60, 41, 'dosis'],
  ['Arena para gatos', ResourceCategory.Supplies, 80, 22, 'kg'],
  ['Cobijas y camas', ResourceCategory.Supplies, 40, 9, 'unidades'],
].map(([title, category, need, got, unit], i) => ({
  id: `need-${i + 1}`,
  organizationId: 'org-1',
  organizationName: ORG.name,
  title: title as string,
  category: category as ResourceCategory,
  quantityNeeded: need as number,
  quantityFulfilled: got as number,
  unit: unit as string,
  progress: (got as number) / (need as number),
  status: ResourceNeedStatus.PartiallyFulfilled,
  createdAt: daysAgo(5),
}));

const PRODUCTS = [
  ['Collar artesanal', ProductCategory.Accessories, 25000],
  ['Concentrado premium 2 kg', ProductCategory.Food, 42000],
  ['Shampoo suave', ProductCategory.Hygiene, 18000],
  ['Pelota resistente', ProductCategory.Toys, 15000],
].map(([name, category, price], i) => ({
  id: `prod-${i + 1}`,
  organizationId: 'org-1',
  organizationName: ORG.name,
  name: name as string,
  category: category as ProductCategory,
  price: price as number,
  stock: 10,
  images: [],
  createdAt: daysAgo(3),
}));

const REVIEWS = [
  {
    id: 'rev-1',
    rating: 5,
    comment: 'El acompañamiento después de adoptar fue impecable.',
    authorName: 'Laura M.',
    createdAt: daysAgo(30),
  },
  {
    id: 'rev-2',
    rating: 5,
    comment: 'Todo el proceso fue claro, desde la visita hasta la firma.',
    createdAt: daysAgo(60),
  },
  {
    id: 'rev-3',
    rating: 4,
    comment: 'Doné para una cirugía y me enviaron el certificado.',
    authorName: 'Camila R.',
    createdAt: daysAgo(90),
  },
];

export const FIXTURE_NOW = NOW;

export const PROFILES: Record<'completa' | 'nueva' | 'vacia' | 'hostil', TemplateSourceData> = {
  completa: {
    slug: 'patitas-felices',
    organization: ORG,
    animals: fixtureAnimals(40),
    animalTotal: 40,
    campaigns: CAMPAIGNS,
    needs: NEEDS,
    products: PRODUCTS,
    reviews: REVIEWS,
  },
  nueva: {
    slug: 'rescatistas-bogota',
    organization: {
      id: 'org-2',
      name: 'Rescatistas de Bogotá',
      slug: 'rescatistas-bogota',
      formalizationState: FormalizationState.EnProceso,
      rteVigente: false,
      verificationLevel: { level: 0, criteria: [] },
      aboutUs:
        'Somos un grupo de rescatistas que empezó recogiendo perros y gatos en situación de calle.',
      socialLinks: { instagram: 'https://instagram.com/rescatistasbog' },
      whatsapp: '3105550000',
      location: { city: 'Bogotá' },
    },
    animals: fixtureAnimals(12, 'org-2'),
    animalTotal: 12,
    campaigns: [],
    needs: NEEDS.slice(0, 2).map((n) => ({ ...n, organizationId: 'org-2' })),
    products: [],
    reviews: [],
  },
  vacia: {
    slug: 'recien-creada',
    organization: { id: 'org-3', name: 'Fundación Recién Creada', slug: 'recien-creada' },
    animals: [],
    animalTotal: 0,
    campaigns: [],
    needs: [],
    products: [],
    reviews: [],
  },
  hostil: (() => {
    const X = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>"\'`';
    const animals = fixtureAnimals(6, 'org-4').map((a) => ({
      ...a,
      name: `${a.name}${X}`,
      breed: X,
      photoUrl: 'javascript:window.__xss=1',
    }));
    return {
      slug: 'hostil"><script>window.__xss=1</script>',
      organization: {
        id: 'org-4"><b>',
        name: `Org ${X}`,
        slug: 'hostil',
        description: X,
        logoUrl: 'javascript:window.__xss=1',
        coverPhotos: ['data:text/html,<script>window.__xss=1</script>'],
        location: { city: X, department: X, country: X },
        socialLinks: {
          instagram: 'javascript:window.__xss=1',
          facebook: 'JaVaScRiPt:window.__xss=1',
          tiktok: '//evil.example.com',
          website: 'https://ok.example.com/"><script>window.__xss=1</script>',
        },
        whatsapp: X,
        contactEmail: `x@y.co"><script>window.__xss=1</script>`,
        formalizationState: FormalizationState.ESAL_RTE,
        rteVigente: true,
        verificationLevel: { level: 2, label: X, criteria: [] },
        aboutUs: X,
        extendedContact: {
          hours: X,
          fullAddress: X,
          mapUrl: 'javascript:window.__xss=1',
          additionalPhones: [X],
        },
        nit: X,
        organizationType: X,
      },
      animals,
      animalTotal: animals.length,
      campaigns: [{ ...CAMPAIGNS[0], organizationId: 'org-4', title: X, description: X }],
      needs: [{ ...NEEDS[0], organizationId: 'org-4', title: X, unit: X }],
      products: [
        {
          ...PRODUCTS[0],
          organizationId: 'org-4',
          name: X,
          images: [{ id: 'i', storageRef: 'r', order: 0, url: 'javascript:window.__xss=1' }],
        },
      ],
      reviews: [{ id: 'r"><b>', rating: 9, comment: X, authorName: X, createdAt: daysAgo(1) }],
    };
  })(),
};
