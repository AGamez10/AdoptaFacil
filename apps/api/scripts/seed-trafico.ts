/**
 * Seed de TRÁFICO ficticio para desarrollo local: deja la base con cifras para
 * ver la landing, los portales públicos, el reporte de impacto y la exportación
 * a Excel "con movimiento". Complementa a `seed:demo` (que prepara la demo del
 * cliente con dos organizaciones y sin actividad) y no depende de él.
 *
 * Uso (desde la raíz del repo, con Postgres y Redis locales arriba):
 *   pnpm seed:trafico --yes-demo
 *
 * Salvaguardas (src/config/demo-seed-guard.ts, con pruebas): se niega con
 * NODE_ENV=production, dentro de CI, si DATABASE_URL o DATABASE_URL_APP no
 * apuntan a localhost, o sin la bandera explícita `--yes-demo`. No está
 * enganchado a ningún arranque, migración ni workflow: solo corre a mano.
 *
 * TODO es ficticio: organizaciones, personas, correos (@example.com),
 * teléfonos (+57 300 000 00xx) y documentos (000000xxx). Las organizaciones lo
 * dicen en su descripción. Fotos = PNG de color generados aquí (sin descargas).
 *
 * Cómo escribe:
 *   - Cuentas, organizaciones, perfiles y animales pasan por los servicios
 *     REALES (AuthService, OrgProfileService, AnimalsService), como seed:demo.
 *   - La actividad (adopciones, contratos, donaciones con recibo, campañas,
 *     voluntariado, horas y eventos clínicos) se inserta con Prisma como el rol
 *     de la app dentro de `withOrgContext`, o sea BAJO RLS. Se hace así para
 *     poder fechar la actividad en los últimos 12 meses (los servicios sellan
 *     "ahora") sin pasar por la pasarela de pago. Esa actividad no deja
 *     registros en la bitácora de auditoría.
 *
 * Idempotente por llaves naturales: correo de cada cuenta, slug de la
 * organización, nombre del animal, (solicitante, animal) de cada solicitud,
 * collection_id de cada donación, título de campaña y de oportunidad,
 * (oportunidad, voluntario) y (inscripción, fecha) de las horas. La "suerte"
 * sale de un generador con semilla fija, así que volver a correrlo planea lo
 * mismo y no duplica nada.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertDemoSeedAllowed, DemoSeedRefusedError } from '../src/config/demo-seed-guard';

/** Same fallback as seed-demo.ts: the guard needs the DB URLs from `.env`. */
function loadRootEnvFallback(): void {
  const envPath = join(__dirname, '..', '..', '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadRootEnvFallback();

try {
  assertDemoSeedAllowed(process.env, process.argv);
} catch (error) {
  if (error instanceof DemoSeedRefusedError) {
    console.error(`[seed:trafico] Se niega a correr: ${error.message}`);
    console.error('[seed:trafico] Uso: pnpm seed:trafico --yes-demo (solo base local).');
    process.exit(1);
  }
  throw error;
}

// Never send a real email nor touch a cloud bucket (see seed-demo.ts).
process.env.NOTIFICATION_DRIVER = 'log';
process.env.STORAGE_DRIVER = 'disk';

import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import {
  type AdoptionContractPayload,
  type AdoptionContractSigner,
  type AnimalSex,
  type AnimalSize,
  type AnimalSpecies,
  ADOPTION_CONTRACT_APPLICABLE_LAWS,
  CURRENT_ADOPTION_CONTRACT_TEMPLATE,
  DEFAULT_FOLLOW_UP_MONTHS,
  DEFAULT_FOLLOW_UP_PLAN,
  DIRECT_COLLECTION_RATES,
  computeBreakdown,
  getLegalDocument,
  type LegalAcceptanceItem,
  OrganizationType,
  requiredLegalDocuments,
} from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/core/auth/auth.service';
import { TenantContextService } from '../src/core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../src/core/storage/storage.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrgProfileService } from '../src/modules/org/org-profile.service';
import { AnimalsService } from '../src/modules/animals/animals.service';
import { computeContractHash } from '../src/modules/adoptions/adoption-contract-hash';
import { runLocalPreflight } from '../src/config/local-preflight';
import { simplePng } from './seed-assets';

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoPass123!';
const SEED_TAG = 'seed-trafico';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const daysAgo = (days: number, hour = 15): Date => {
  const d = new Date(NOW - days * DAY_MS);
  d.setUTCHours(hour, (days * 7) % 60, 0, 0);
  return d;
};

/** Deterministic PRNG (mulberry32) seeded from a string: same plan every run. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(rand: () => number, list: readonly T[]): T =>
  list[Math.floor(rand() * list.length)];
const between = (rand: () => number, min: number, max: number): number =>
  min + Math.floor(rand() * (max - min + 1));

const lighten = (rgb: readonly [number, number, number]): [number, number, number] => [
  Math.min(255, rgb[0] + 60),
  Math.min(255, rgb[1] + 60),
  Math.min(255, rgb[2] + 60),
];

function acceptances(accountType: 'organization' | 'person'): LegalAcceptanceItem[] {
  return requiredLegalDocuments(accountType).map((key) => ({
    key,
    version: getLegalDocument(key).version,
  }));
}

// ---------------------------------------------------------------------------
// Ficticio de punta a punta.
// ---------------------------------------------------------------------------

interface OrgDef {
  key: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  type: OrganizationType;
  city: string;
  department: string;
  color: readonly [number, number, number];
  pitch: string;
}

const FICTION_NOTE = 'Organización ficticia creada por el seeder de tráfico para pruebas locales.';

const ORGS: OrgDef[] = [
  {
    key: 'arrullo-animal',
    name: 'Refugio Arrullo Animal',
    ownerName: 'Mariana Quintero Lozada',
    ownerEmail: 'demo.arrullo@example.com',
    type: OrganizationType.Shelter,
    city: 'Cali',
    department: 'Valle del Cauca',
    color: [52, 168, 140],
    pitch: 'Rescatamos perros y gatos de la ladera y los preparamos para un hogar para siempre.',
  },
  {
    key: 'colitas-de-brisa',
    name: 'Fundación Colitas de Brisa',
    ownerName: 'Julián Orozco Peñaranda',
    ownerEmail: 'demo.colitas@example.com',
    type: OrganizationType.Foundation,
    city: 'Barranquilla',
    department: 'Atlántico',
    color: [236, 132, 76],
    pitch: 'Esterilizamos, curamos y damos en adopción responsable a los animales del barrio.',
  },
  {
    key: 'sendero-peludo',
    name: 'Asociación Sendero Peludo',
    ownerName: 'Paula Andrea Villamizar',
    ownerEmail: 'demo.sendero@example.com',
    type: OrganizationType.Association,
    city: 'Bucaramanga',
    department: 'Santander',
    color: [99, 102, 241],
    pitch: 'Red de hogares de paso que acompaña cada adopción con seguimiento cercano.',
  },
  {
    key: 'ladrido-sereno',
    name: 'Corporación Ladrido Sereno',
    ownerName: 'Esteban Marulanda Ríos',
    ownerEmail: 'demo.ladrido@example.com',
    type: OrganizationType.Corporation,
    city: 'Pereira',
    department: 'Risaralda',
    color: [217, 70, 120],
    pitch: 'Damos una segunda oportunidad a perros sénior y gatos con necesidades especiales.',
  },
];

interface AnimalDef {
  name: string;
  species: AnimalSpecies;
  sex: AnimalSex;
  size: AnimalSize;
  months: number;
  breed?: string;
  color: readonly [number, number, number];
  description: string;
}

type AnimalRow = [
  string,
  AnimalSpecies,
  AnimalSex,
  AnimalSize,
  number,
  string | undefined,
  [number, number, number],
  string,
];

const ANIMAL_ROWS: AnimalRow[] = [
  [
    'Canela',
    'dog',
    'female',
    'medium',
    30,
    'Criollo',
    [196, 132, 72],
    'Dulce y paciente, camina bien con correa.',
  ],
  [
    'Bruno',
    'dog',
    'male',
    'large',
    48,
    'Labrador mestizo',
    [120, 84, 52],
    'Noble con niños, necesita patio.',
  ],
  [
    'Mota',
    'cat',
    'female',
    'small',
    14,
    undefined,
    [235, 235, 228],
    'Curiosa, usa arenero, esterilizada.',
  ],
  [
    'Tango',
    'dog',
    'male',
    'medium',
    22,
    'Criollo',
    [60, 60, 60],
    'Juguetón, ideal para una familia activa.',
  ],
  [
    'Kiara',
    'cat',
    'female',
    'small',
    36,
    'Siamés mestizo',
    [222, 205, 170],
    'Tranquila, perfecta para apartamento.',
  ],
  [
    'Pancho',
    'dog',
    'male',
    'small',
    84,
    undefined,
    [210, 190, 150],
    'Perro sénior, calmado y cariñoso.',
  ],
  [
    'Lola',
    'dog',
    'female',
    'small',
    10,
    'Criollo',
    [170, 110, 70],
    'Cachorra con mucha energía, aprende rápido.',
  ],
  ['Gaspar', 'cat', 'male', 'medium', 26, undefined, [250, 170, 60], 'Gato naranja muy sociable.'],
  [
    'Nube',
    'cat',
    'female',
    'small',
    8,
    undefined,
    [200, 200, 210],
    'Gatita rescatada, muy mimosa.',
  ],
  [
    'Rambo',
    'dog',
    'male',
    'large',
    60,
    'Pastor mestizo',
    [90, 70, 40],
    'Protector, convive con otros perros.',
  ],
  [
    'Frida',
    'dog',
    'female',
    'medium',
    40,
    'Criollo',
    [140, 100, 80],
    'Recuperada de una fractura, ya corre feliz.',
  ],
  ['Simba', 'cat', 'male', 'medium', 18, undefined, [230, 180, 90], 'Le encanta jugar con plumas.'],
  [
    'Chispa',
    'dog',
    'female',
    'small',
    16,
    'Criollo',
    [240, 220, 190],
    'Pequeña y valiente, sabe sentarse.',
  ],
  [
    'Tomás',
    'dog',
    'male',
    'medium',
    54,
    undefined,
    [110, 110, 110],
    'Tímido al inicio, luego inseparable.',
  ],
  [
    'Luna',
    'cat',
    'female',
    'small',
    28,
    undefined,
    [30, 30, 30],
    'Gata negra elegante y tranquila.',
  ],
  [
    'Max',
    'dog',
    'male',
    'large',
    36,
    'Golden mestizo',
    [220, 170, 90],
    'Amigable con todo el mundo.',
  ],
  [
    'Pelusa',
    'cat',
    'female',
    'small',
    60,
    'Angora mestizo',
    [245, 245, 245],
    'Sénior, busca un hogar sereno.',
  ],
  [
    'Coco',
    'dog',
    'male',
    'small',
    20,
    'Criollo',
    [150, 90, 50],
    'Alegre, se lleva bien con gatos.',
  ],
  [
    'Maya',
    'dog',
    'female',
    'medium',
    32,
    undefined,
    [180, 150, 120],
    'Obediente, ya sabe pasear sin jalar.',
  ],
  ['Oliver', 'cat', 'male', 'small', 12, undefined, [130, 130, 140], 'Gato gris muy conversador.'],
  [
    'Kira',
    'dog',
    'female',
    'large',
    44,
    'Pastor mestizo',
    [80, 60, 40],
    'Activa, ideal para salir a trotar.',
  ],
  [
    'Bigotes',
    'cat',
    'male',
    'medium',
    72,
    undefined,
    [200, 160, 110],
    'Sénior dormilón y cariñoso.',
  ],
  [
    'Rocky',
    'dog',
    'male',
    'medium',
    26,
    'Criollo',
    [100, 80, 60],
    'Le encanta el agua y la pelota.',
  ],
  ['Mía', 'cat', 'female', 'small', 6, undefined, [240, 200, 160], 'La más pequeña de su camada.'],
  [
    'Zeus',
    'dog',
    'male',
    'large',
    66,
    undefined,
    [70, 70, 70],
    'Grande y tranquilo, un oso de peluche.',
  ],
  ['Trufa', 'dog', 'female', 'small', 18, 'Criollo', [90, 60, 40], 'Sociable, ya está vacunada.'],
  [
    'Felipe',
    'cat',
    'male',
    'medium',
    40,
    undefined,
    [180, 180, 170],
    'Independiente pero muy limpio.',
  ],
  [
    'Sasha',
    'dog',
    'female',
    'medium',
    50,
    undefined,
    [210, 180, 140],
    'Superó la calle y hoy confía en todos.',
  ],
  [
    'Milo',
    'dog',
    'male',
    'small',
    9,
    'Criollo',
    [230, 210, 170],
    'Cachorro curioso, aprende trucos.',
  ],
  [
    'Tita',
    'cat',
    'female',
    'small',
    34,
    undefined,
    [160, 120, 90],
    'Le gustan las ventanas y el sol.',
  ],
  [
    'Duque',
    'dog',
    'male',
    'large',
    78,
    'Labrador mestizo',
    [40, 40, 40],
    'Sénior noble, camina despacio.',
  ],
  ['Perla', 'cat', 'female', 'small', 22, undefined, [250, 250, 240], 'Ojos azules, muy dulce.'],
  [
    'Thor',
    'dog',
    'male',
    'medium',
    28,
    'Criollo',
    [160, 120, 70],
    'Protector y leal, ya esterilizado.',
  ],
  [
    'Arena',
    'dog',
    'female',
    'medium',
    38,
    undefined,
    [220, 200, 160],
    'Tranquila en casa, alegre en el parque.',
  ],
  ['Pipo', 'cat', 'male', 'small', 15, undefined, [60, 50, 50], 'Juguetón, convive con perros.'],
  [
    'Estrella',
    'dog',
    'female',
    'small',
    58,
    'Criollo',
    [200, 140, 100],
    'Sénior coqueta y tranquila.',
  ],
];
const ANIMAL_POOL: AnimalDef[] = ANIMAL_ROWS.map(
  ([name, species, sex, size, months, breed, color, description]) => ({
    name,
    species,
    sex,
    size,
    months,
    breed,
    color,
    description,
  }),
);
const ANIMALS_PER_ORG = 9;

interface PersonDef {
  name: string;
  email: string;
  phone: string;
  document: string;
}

const PEOPLE: PersonDef[] = [
  'Laura Restrepo Galvis',
  'Santiago Cárdenas Mejía',
  'Daniela Ospina Lara',
  'Felipe Arango Duque',
  'Natalia Bermúdez Rincón',
  'Sebastián Henao Pulido',
  'Carolina Zapata Muñoz',
  'Mateo Salazar Gil',
  'Isabela Cortés Vélez',
  'Nicolás Montoya Parra',
  'Valeria Acosta Ruiz',
  'Tomás Echeverri Lopera',
  'Sara Guerrero Pineda',
  'Alejandro Patiño Rueda',
  'Manuela Castaño Soto',
  'David Londoño Arias',
].map((name, i) => {
  const [first, last] = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ');
  const n = String(i + 1).padStart(2, '0');
  return {
    name,
    email: `${first}.${last}@example.com`,
    phone: `+57 300 000 00${n}`,
    document: `0000000${n}`,
  };
});

const CAMPAIGNS = [
  {
    title: 'Cirugías del trimestre',
    category: 'surgeries',
    goal: 2_400_000,
    startDaysAgo: 150,
    deadlineDays: 45,
  },
  {
    title: 'Jornada de esterilización del barrio',
    category: 'sterilizations',
    goal: 600_000,
    startDaysAgo: 320,
    deadlineDays: -180,
  },
  {
    title: 'Alimento para el invierno',
    category: 'food',
    goal: 900_000,
    startDaysAgo: 60,
    deadlineDays: 20,
  },
] as const;

const OPPORTUNITIES = [
  {
    title: 'Paseos de fin de semana',
    category: 'Paseos y socialización',
    student: false,
    capacity: 12,
  },
  {
    title: 'Servicio social: cuidado diario en el refugio',
    category: 'Cuidado de animales',
    student: true,
    capacity: 8,
  },
] as const;

// ---------------------------------------------------------------------------

interface Person {
  def: PersonDef;
  userId: string;
}

async function main(): Promise<void> {
  await runLocalPreflight(['postgres', 'redis'], 'seed:trafico no puede cargar los datos');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  const tenant = app.get(TenantContextService);
  const auth = app.get(AuthService);
  const prisma = app.get(PrismaService);
  const storage = app.get<StoragePort>(STORAGE_PORT);
  const orgProfile = app.get(OrgProfileService);
  const animalsService = app.get(AnimalsService);

  const totals = {
    orgs: 0,
    animals: 0,
    requests: 0,
    contracts: 0,
    donations: 0,
    campaigns: 0,
    enrollments: 0,
    hours: 0,
    clinical: 0,
  };

  try {
    // --- 1. Personas ficticias (adoptantes, donantes y voluntarios) ---------
    const people: Person[] = [];
    for (const def of PEOPLE) {
      const existing = await prisma.authCredential.findUnique({ where: { email: def.email } });
      if (existing) {
        people.push({ def, userId: existing.userId });
        continue;
      }
      const session = await auth.registerPerson({
        displayName: def.name,
        email: def.email,
        password: PASSWORD,
        legalAcceptances: acceptances('person'),
      });
      people.push({ def, userId: session.user.id });
    }
    console.log(`[seed:trafico] ${people.length} personas ficticias listas.`);

    for (const [orgIndex, def] of ORGS.entries()) {
      const rand = rng(`${SEED_TAG}:${def.key}`);
      console.log(`\n[seed:trafico] === ${def.name} (${def.city}) ===`);

      // --- 2. Organización + perfil (servicios reales) ----------------------
      let organizationId: string;
      let ownerUserId: string;
      const existingOwner = await prisma.authCredential.findUnique({
        where: { email: def.ownerEmail },
      });
      if (existingOwner) {
        organizationId = existingOwner.organizationId;
        ownerUserId = existingOwner.userId;
      } else {
        const session = await auth.registerOrganization({
          organizationName: def.name,
          displayName: def.ownerName,
          email: def.ownerEmail,
          password: PASSWORD,
          legalAcceptances: acceptances('organization'),
        });
        organizationId = session.user.organizationId;
        ownerUserId = session.user.id;
        totals.orgs += 1;
      }
      // Local only (guard above): approve it so its portal and catalog are public.
      await prisma.organization.update({
        where: { id: organizationId },
        data: { status: 'approved', statusReason: null, statusChangedAt: new Date() },
      });

      const publicImage = async (filename: string, bytes: Buffer): Promise<string> => {
        const target = await storage.createUploadTarget({
          organizationId,
          filename,
          contentType: 'image/png',
          visibility: 'public',
        });
        await storage.saveObject(target.key, bytes, 'image/png');
        return storage.resolvePublicUrl(target.key);
      };
      const profile = await prisma.withOrgContext(organizationId, (tx) =>
        tx.organizationProfile.findUnique({ where: { organizationId } }),
      );
      await tenant.run({ organizationId }, async () =>
        orgProfile.updateProfile(ownerUserId, {
          description: `${def.pitch} ${FICTION_NOTE}`,
          // Images are uploaded once; re-runs keep the existing URLs.
          logoUrl:
            profile?.logoUrl ??
            (await publicImage(`${def.key}-logo.png`, simplePng(320, 320, def.color))),
          coverPhotos:
            profile?.coverPhotos && (profile.coverPhotos as unknown[]).length > 0
              ? (profile.coverPhotos as string[])
              : [
                  await publicImage(
                    `${def.key}-cover.png`,
                    simplePng(800, 300, lighten(def.color)),
                  ),
                ],
          location: { country: 'Colombia', department: def.department, city: def.city },
          socialLinks: { instagram: `https://instagram.com/${def.key}.example` },
          organizationType: def.type,
          slug: def.key,
        }),
      );

      // --- 3. Animales (servicio real) con foto de placeholder --------------
      const animalDefs = ANIMAL_POOL.slice(
        orgIndex * ANIMALS_PER_ORG,
        (orgIndex + 1) * ANIMALS_PER_ORG,
      );
      await tenant.run({ organizationId }, async () => {
        const existing = await animalsService.list(true);
        for (const [i, a] of animalDefs.entries()) {
          if (existing.some((e) => e.name === a.name)) continue;
          const created = await animalsService.create(ownerUserId, {
            name: a.name,
            species: a.species,
            sex: a.sex,
            size: a.size,
            customBreed: a.breed,
            birthDate: new Date(NOW - a.months * 30 * DAY_MS).toISOString(),
            description: a.description,
            photos: [{ filename: `${a.name.toLowerCase()}.png`, contentType: 'image/png' }],
          });
          const key = created.photoRecords?.[0]?.storageRef;
          if (key) await storage.saveObject(key, simplePng(480, 480, a.color), 'image/png');
          // Spread intake over the last year so the "registered" figures move.
          await prisma.withOrgContext(organizationId, (tx) =>
            tx.animal.update({
              where: { id: created.id },
              data: { createdAt: daysAgo(340 - i * 35) },
            }),
          );
          totals.animals += 1;
        }
      });
      const animals = await prisma.withOrgContext(organizationId, (tx) =>
        tx.animal.findMany({
          where: { organizationId, name: { in: animalDefs.map((a) => a.name) } },
          include: { photos: { orderBy: { order: 'asc' }, take: 1 } },
        }),
      );
      const animalByName = new Map(animals.map((a) => [a.name, a]));
      const orderedAnimals = animalDefs.map((a) => animalByName.get(a.name)!);

      // --- 4. Eventos clínicos (alimentan "atenciones" del reporte) ---------
      await prisma.withOrgContext(organizationId, async (tx) => {
        for (const [i, animal] of orderedAnimals.entries()) {
          if ((await tx.clinicalEvent.count({ where: { animalId: animal.id } })) > 0) continue;
          const events: { type: string; days: number; details: Record<string, unknown> }[] = [
            {
              type: 'vaccine',
              days: 300 - i * 25,
              details: { vaccine: 'Múltiple', lote: `DEMO-${i}` },
            },
          ];
          if (i % 2 === 0) events.push({ type: 'sterilization', days: 200 - i * 15, details: {} });
          if (i % 3 === 0)
            events.push({
              type: 'treatment',
              days: 90 - i * 5,
              details: { notes: 'Desparasitación' },
            });
          if (i === 4)
            events.push({ type: 'surgery', days: 120, details: { notes: 'Cirugía menor' } });
          for (const e of events) {
            await tx.clinicalEvent.create({
              data: {
                eventId: randomUUID(),
                organizationId,
                animalId: animal.id,
                type: e.type,
                occurredAt: daysAgo(Math.max(3, e.days)),
                details: e.details as Prisma.InputJsonValue,
                version: 1,
                authorUserId: ownerUserId,
              },
            });
            totals.clinical += 1;
          }
        }
      });

      // --- 5. Adopciones en distintos estados -------------------------------
      // Animal 0-1: firmadas (adopted) · 2: contrato esperando firmas
      // (in_process) · 3-4: en revisión · 5-6: nuevas · 7: rechazada · 8: libre.
      const plan: { status: string; contract?: 'signed' | 'pending_signatures'; days: number }[] = [
        { status: 'approved', contract: 'signed', days: 260 },
        { status: 'approved', contract: 'signed', days: 110 },
        { status: 'approved', contract: 'pending_signatures', days: 25 },
        { status: 'in_review', days: 12 },
        { status: 'in_review', days: 8 },
        { status: 'new', days: 3 },
        { status: 'new', days: 1 },
        { status: 'rejected', days: 40 },
      ];
      for (const [i, step] of plan.entries()) {
        const animal = orderedAnimals[i];
        const person = people[(orgIndex * 3 + i) % people.length];
        const created = await prisma.withOrgContext(organizationId, async (tx) => {
          const exists = await tx.adoptionRequest.findFirst({
            where: { animalId: animal.id, applicantUserId: person.userId },
          });
          if (exists) return false;
          const createdAt = daysAgo(step.days);
          const decidedAt = daysAgo(Math.max(0, step.days - 4));
          const photo = animal.photos[0]?.storageRef;
          const snapshot = {
            animalId: animal.id,
            name: animal.name,
            species: animal.species as AnimalSpecies,
            ...(photo ? { photoUrl: storage.resolvePublicUrl(photo) } : {}),
          };
          const applicant = {
            fullName: person.def.name,
            email: person.def.email,
            phone: person.def.phone,
          };
          const request = await tx.adoptionRequest.create({
            data: {
              organizationId,
              animalId: animal.id,
              animalSnapshot: snapshot,
              applicantUserId: person.userId,
              applicant,
              message: `Hola, quisiera conocer a ${animal.name}. Tengo tiempo y espacio para cuidarle.`,
              status: step.status,
              createdAt,
              updatedAt: step.status === 'new' ? createdAt : decidedAt,
            },
          });
          totals.requests += 1;
          if (!step.contract) return true;

          const signed = step.contract === 'signed';
          const signedAt = daysAgo(Math.max(0, step.days - 10));
          const signers: AdoptionContractSigner[] = [
            {
              id: randomUUID(),
              role: 'organization_representative',
              fullName: def.ownerName,
              email: def.ownerEmail,
              userId: ownerUserId,
              ...(signed ? { signedAt: signedAt.toISOString() } : {}),
            },
            {
              id: randomUUID(),
              role: 'adopter',
              fullName: person.def.name,
              email: person.def.email,
              userId: person.userId,
              ...(signed ? { signedAt: signedAt.toISOString() } : {}),
            },
          ];
          const payload: AdoptionContractPayload = {
            requestId: request.id,
            organizationId,
            animalId: animal.id,
            animal: snapshot,
            applicant,
            applicableLaws: ADOPTION_CONTRACT_APPLICABLE_LAWS,
            terms: '',
            data: {
              organizationName: def.name,
              animalSex: animal.sex,
              adopterDocumentType: 'CC',
              adopterDocumentNumber: person.def.document,
              followUpMonths: DEFAULT_FOLLOW_UP_MONTHS,
              followUpPlan: DEFAULT_FOLLOW_UP_PLAN,
              signatureCity: def.city,
            },
            templateVersion: CURRENT_ADOPTION_CONTRACT_TEMPLATE,
          };
          const contract = await tx.adoptionContract.create({
            data: {
              organizationId,
              requestId: request.id,
              animalId: animal.id,
              version: 1,
              status: step.contract,
              signers: signers as unknown as Prisma.InputJsonValue,
              payload: payload as unknown as Prisma.InputJsonValue,
              contentHash: signed ? computeContractHash(payload) : null,
              signedAt: signed ? signedAt : null,
              createdAt: decidedAt,
              updatedAt: signed ? signedAt : decidedAt,
            },
          });
          await tx.adoptionRequest.update({
            where: { id: request.id },
            data: { contractRef: contract.id, updatedAt: decidedAt },
          });
          totals.contracts += 1;
          return true;
        });
        if (created && step.contract) {
          await prisma.withOrgContext(organizationId, (tx) =>
            tx.animal.update({
              where: { id: animal.id },
              data: { status: step.contract === 'signed' ? 'adopted' : 'in_process' },
            }),
          );
        }
      }

      // --- 6. Campañas ------------------------------------------------------
      const campaignIds: string[] = [];
      await prisma.withOrgContext(organizationId, async (tx) => {
        for (const c of CAMPAIGNS) {
          const title = `${c.title}`;
          let row = await tx.campaign.findFirst({ where: { organizationId, title } });
          if (!row) {
            row = await tx.campaign.create({
              data: {
                organizationId,
                title,
                description: `Campaña ficticia de ${def.name} para ver el portal con cifras.`,
                category: c.category,
                goalAmount: c.goal,
                deadline: daysAgo(-c.deadlineDays),
                status: c.deadlineDays < 0 ? 'closed' : 'active',
                createdAt: daysAgo(c.startDaysAgo),
              },
            });
            totals.campaigns += 1;
          }
          campaignIds.push(row.id);
        }
      });

      // --- 7. Donaciones (aprobadas con recibo, pendientes y rechazadas) ----
      const donationCount = between(rand, 24, 32);
      const available = orderedAnimals.filter((_, i) => i >= 3);
      for (let n = 1; n <= donationCount; n += 1) {
        // Weighted toward recent months so the trend goes up.
        const days = Math.floor(Math.pow(rand(), 1.3) * 355) + 1;
        const r = rand();
        const status = r < 0.8 ? 'approved' : r < 0.9 ? 'pending' : 'declined';
        const conceptRoll = rand();
        const targetRoll = rand();
        // A campaign only receives donations while it is open.
        const openCampaigns = campaignIds.filter(
          (_, c) => days <= CAMPAIGNS[c].startDaysAgo && days >= -CAMPAIGNS[c].deadlineDays,
        );
        const concept =
          conceptRoll < 0.3 && openCampaigns.length > 0
            ? {
                kind: 'campaign',
                id: openCampaigns[Math.floor(targetRoll * openCampaigns.length)],
              }
            : conceptRoll < 0.45
              ? { kind: 'animal', id: available[Math.floor(targetRoll * available.length)].id }
              : { kind: 'organization', id: organizationId };
        const intended =
          concept.kind === 'campaign'
            ? pick(rand, [80_000, 100_000, 150_000, 200_000, 300_000])
            : pick(rand, [10_000, 20_000, 25_000, 30_000, 50_000, 50_000, 100_000, 150_000]);
        const commissionPayer = rand() < 0.5 ? 'donor' : 'organization';
        const guest = rand() < 0.35;
        const person = pick(rand, people);
        const anonymous = rand() < 0.15;
        const payer = guest
          ? { fullName: `Invitado Demo ${n}`, email: `invitado.${def.key}.${n}@example.com` }
          : { fullName: person.def.name, email: person.def.email, documentId: person.def.document };
        const collectionId = `${SEED_TAG}-${def.key}-${n}`;
        const createdAt = daysAgo(days, 10 + (n % 10));
        await prisma.withOrgContext(organizationId, async (tx) => {
          if (await tx.donation.findUnique({ where: { collectionId } })) return;
          const breakdown = computeBreakdown(intended, commissionPayer, DIRECT_COLLECTION_RATES);
          const settledAt = new Date(createdAt.getTime() + 5 * 60_000);
          await tx.donation.create({
            data: {
              organizationId,
              donorUserId: guest ? null : person.userId,
              conceptKind: concept.kind,
              conceptId: concept.id,
              commissionPayer,
              intendedAmount: intended,
              amountCharged: breakdown.amountCharged,
              breakdown: breakdown as unknown as Prisma.InputJsonValue,
              collectionId,
              idempotencyKey: collectionId,
              status,
              payer,
              anonymous,
              createdAt,
              updatedAt: status === 'pending' ? createdAt : settledAt,
              ...(status === 'approved'
                ? {
                    receipt: {
                      create: {
                        organizationId,
                        dedupKey: collectionId,
                        donor: payer,
                        intendedAmount: intended,
                        breakdown: breakdown as unknown as Prisma.InputJsonValue,
                        issuedAt: settledAt,
                        createdAt: settledAt,
                      },
                    },
                  }
                : {}),
            },
          });
          totals.donations += 1;
        });
      }

      // Campaign progress = net of its approved donations (recomputed every run).
      await prisma.withOrgContext(organizationId, async (tx) => {
        for (const id of campaignIds) {
          const rows = await tx.donation.findMany({
            where: { organizationId, conceptKind: 'campaign', conceptId: id, status: 'approved' },
            select: { breakdown: true },
          });
          const raised = rows.reduce((s, d) => s + ((d.breakdown as { net?: number }).net ?? 0), 0);
          await tx.campaign.update({ where: { id }, data: { raisedAmount: raised } });
        }
      });

      // --- 8. Voluntariado: oportunidades, inscripciones y horas ------------
      for (const [o, opp] of OPPORTUNITIES.entries()) {
        await prisma.withOrgContext(organizationId, async (tx) => {
          let row = await tx.volunteerOpportunity.findFirst({
            where: { organizationId, title: opp.title },
          });
          if (!row) {
            row = await tx.volunteerOpportunity.create({
              data: {
                organizationId,
                title: opp.title,
                description: `Oportunidad ficticia de ${def.name}.`,
                category: opp.category,
                startDate: daysAgo(200),
                endDate: daysAgo(-120),
                capacity: opp.capacity,
                location: `${def.city}, ${def.department}`,
                appliesToStudentService: opp.student,
                createdAt: daysAgo(210),
              },
            });
          }
          // 5 people per opportunity: 3 accepted, 1 pending, 1 rejected.
          const statuses = ['accepted', 'accepted', 'accepted', 'pending', 'rejected'] as const;
          for (const [v, status] of statuses.entries()) {
            const person = people[(orgIndex * 4 + o * 5 + v + 6) % people.length];
            let enrollment = await tx.volunteerEnrollment.findUnique({
              where: {
                opportunityId_volunteerUserId: {
                  opportunityId: row.id,
                  volunteerUserId: person.userId,
                },
              },
            });
            if (!enrollment) {
              enrollment = await tx.volunteerEnrollment.create({
                data: {
                  organizationId,
                  opportunityId: row.id,
                  volunteerUserId: person.userId,
                  volunteerName: person.def.name,
                  volunteerEmail: person.def.email,
                  appliesToStudentService: opp.student,
                  status,
                  rejectionReason:
                    status === 'rejected' ? 'Cupo completo para este horario.' : null,
                  decidedByUserId: status === 'pending' ? null : ownerUserId,
                  decidedAt: status === 'pending' ? null : daysAgo(170 - v * 10),
                  createdAt: daysAgo(180 - v * 10),
                },
              });
              totals.enrollments += 1;
            }
            if (status !== 'accepted') continue;
            // Weekly shifts; the latest one still waiting for approval.
            // Drawn up front so every run consumes the generator the same way;
            // shifts already stored (counted, not matched by date, since dates
            // are relative to today) are skipped.
            const shifts = Array.from({ length: between(rand, 4, 7) }, () => ({
              hours: pick(rand, [2, 3, 3, 4, 4.5]),
              description: pick(rand, [
                'Paseo y socialización de perros.',
                'Limpieza de caniles y cambio de arena.',
                'Apoyo en jornada de adopción.',
                'Alimentación y registro de pesos.',
              ]),
            }));
            const stored = await tx.serviceHours.count({ where: { enrollmentId: enrollment.id } });
            for (let s = stored; s < shifts.length; s += 1) {
              const date = daysAgo(150 - v * 9 - s * 21, 12);
              const pending = s === shifts.length - 1;
              await tx.serviceHours.create({
                data: {
                  organizationId,
                  enrollmentId: enrollment.id,
                  volunteerUserId: person.userId,
                  date,
                  hours: shifts[s].hours,
                  description: shifts[s].description,
                  status: pending ? 'pending' : 'approved',
                  decidedByUserId: pending ? null : ownerUserId,
                  decidedAt: pending ? null : new Date(date.getTime() + 2 * DAY_MS),
                  createdAt: date,
                },
              });
              totals.hours += 1;
            }
          }
        });
      }
      console.log(`[seed:trafico] Portal público: /o/${def.key}`);
    }

    console.log('\n[seed:trafico] Listo. Creado en esta corrida (0 = ya existía):');
    console.table(totals);
    console.log('[seed:trafico] Cuentas (contraseña: SEED_DEMO_PASSWORD o el default de dev):');
    console.table([
      ...ORGS.map((o) => ({ Rol: `Owner — ${o.name}`, Correo: o.ownerEmail })),
      ...PEOPLE.slice(0, 3).map((p) => ({ Rol: 'Persona (adoptante/donante)', Correo: p.email })),
    ]);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('[seed:trafico] Error:', error);
  process.exit(1);
});
