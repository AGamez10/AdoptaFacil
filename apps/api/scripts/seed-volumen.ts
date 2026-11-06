/**
 * Seed de VOLUMEN para desarrollo local: una organización ficticia con muchos
 * animales (100 por defecto) para probar a mano lo que solo se rompe con
 * volumen, como la ficha pública de un animal que no carga cuando la
 * organización tiene más de 50 (plan SEO, PR #59).
 *
 * Uso (desde la raíz del repo, con Postgres y Redis locales arriba y las
 * migraciones aplicadas):
 *   pnpm seed:volumen --yes-demo                 # 100 animales
 *   pnpm seed:volumen --yes-demo --animales=250  # otra cantidad (1 a 1000)
 *
 * Salvaguardas: las mismas de seed:demo y seed:trafico
 * (src/config/demo-seed-guard.ts): se niega con NODE_ENV=production, en CI, si
 * la base no es local o sin `--yes-demo`.
 *
 * Todo es ficticio: la organización lo dice en su descripción, el correo es
 * @example.com y las fotos son PNG de color generados aquí (sin descargas).
 * Cuenta, organización, perfil y animales pasan por los servicios REALES
 * (AuthService, OrgProfileService, AnimalsService). Idempotente: los animales
 * se llaman "Volumen 001", "Volumen 002"…; volver a correrlo solo crea los que
 * falten.
 */
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
    console.error(`[seed:volumen] Se niega a correr: ${error.message}`);
    console.error('[seed:volumen] Uso: pnpm seed:volumen --yes-demo (solo base local).');
    process.exit(1);
  }
  throw error;
}

// Never send a real email nor touch a cloud bucket (see seed-demo.ts).
process.env.NOTIFICATION_DRIVER = 'log';
process.env.STORAGE_DRIVER = 'disk';

import { NestFactory } from '@nestjs/core';
import {
  type AnimalSex,
  type AnimalSize,
  type AnimalSpecies,
  getLegalDocument,
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
import { runLocalPreflight } from '../src/config/local-preflight';
import { simplePng } from './seed-assets';

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoPass123!';
const ORG = {
  slug: 'refugio-volumen',
  name: 'Refugio Volumen (prueba)',
  ownerName: 'Dueña Volumen',
  ownerEmail: 'volumen.owner@example.com',
  city: 'Bogotá',
  department: 'Bogotá D.C.',
};
const NAME_PREFIX = 'Volumen';
const DAY_MS = 24 * 60 * 60 * 1000;

const SPECIES: readonly AnimalSpecies[] = ['dog', 'dog', 'cat'];
const SEXES: readonly AnimalSex[] = ['male', 'female'];
const SIZES: readonly AnimalSize[] = ['small', 'medium', 'large'];
const COLORS: readonly (readonly [number, number, number])[] = [
  [214, 120, 72],
  [94, 140, 196],
  [120, 170, 110],
  [190, 150, 80],
  [160, 110, 180],
];

/** `--animales=N` (1 a 1000); 100 por defecto. */
export function parseAnimalCount(argv: readonly string[]): number {
  const flag = argv.find((arg) => arg.startsWith('--animales='));
  if (!flag) return 100;
  const value = Number(flag.slice('--animales='.length));
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    throw new Error('--animales debe ser un entero entre 1 y 1000');
  }
  return value;
}

const animalName = (index: number): string => `${NAME_PREFIX} ${String(index).padStart(3, '0')}`;

async function main(): Promise<void> {
  const count = parseAnimalCount(process.argv);
  await runLocalPreflight(['postgres', 'redis'], 'seed:volumen no puede cargar los datos');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const tenant = app.get(TenantContextService);
  const auth = app.get(AuthService);
  const prisma = app.get(PrismaService);
  const storage = app.get<StoragePort>(STORAGE_PORT);
  const orgProfile = app.get(OrgProfileService);
  const animalsService = app.get(AnimalsService);

  try {
    // --- Organización + perfil público (servicios reales) -------------------
    const existingOwner = await prisma.authCredential.findUnique({
      where: { email: ORG.ownerEmail },
    });
    let organizationId: string;
    let ownerUserId: string;
    if (existingOwner) {
      organizationId = existingOwner.organizationId;
      ownerUserId = existingOwner.userId;
    } else {
      const session = await auth.registerOrganization({
        organizationName: ORG.name,
        displayName: ORG.ownerName,
        email: ORG.ownerEmail,
        password: PASSWORD,
        legalAcceptances: requiredLegalDocuments('organization').map((key) => ({
          key,
          version: getLegalDocument(key).version,
        })),
      });
      organizationId = session.user.organizationId;
      ownerUserId = session.user.id;
    }
    // Local only (guard above): approve it so its portal and catalog are public.
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: 'approved', statusReason: null, statusChangedAt: new Date() },
    });
    await tenant.run({ organizationId }, async () =>
      orgProfile.updateProfile(ownerUserId, {
        description:
          'Organización ficticia creada por seed:volumen para probar el catálogo con muchos animales.',
        location: { country: 'Colombia', department: ORG.department, city: ORG.city },
        organizationType: OrganizationType.Foundation,
        slug: ORG.slug,
      }),
    );

    // --- Animales (servicio real) con foto de color ---------------------------
    let created = 0;
    await tenant.run({ organizationId }, async () => {
      const existing = new Set((await animalsService.list(true)).map((a) => a.name));
      for (let i = 1; i <= count; i += 1) {
        const name = animalName(i);
        if (existing.has(name)) continue;
        const animal = await animalsService.create(ownerUserId, {
          name,
          species: SPECIES[i % SPECIES.length],
          sex: SEXES[i % SEXES.length],
          size: SIZES[i % SIZES.length],
          birthDate: new Date(Date.now() - (3 + (i % 96)) * 30 * DAY_MS).toISOString(),
          description: `Animal ficticio número ${i} del seed de volumen.`,
          photos: [{ filename: `volumen-${i}.png`, contentType: 'image/png' }],
        });
        const key = animal.photoRecords?.[0]?.storageRef;
        if (key) {
          await storage.saveObject(
            key,
            simplePng(480, 480, COLORS[i % COLORS.length]),
            'image/png',
          );
        }
        created += 1;
        if (created % 25 === 0) console.log(`[seed:volumen] ${created} animales creados…`);
      }
    });

    const oldest = await prisma.withOrgContext(organizationId, (tx) =>
      tx.animal.findFirst({
        where: { organizationId, name: animalName(1) },
        select: { name: true, publicCode: true },
      }),
    );
    console.log(`\n[seed:volumen] Listo: ${created} animales nuevos (de ${count} pedidos).`);
    console.log(`[seed:volumen] Portal:   /o/${ORG.slug}`);
    console.log(`[seed:volumen] Catálogo: /adoptar (filtra por ${ORG.city})`);
    if (oldest) {
      // The oldest one sits past the first 50 of the catalog: the case PR #59 fixed.
      console.log(
        `[seed:volumen] Ficha del más antiguo (fuera de los primeros 50): /o/${ORG.slug}/animales/volumen-001-${oldest.publicCode}`,
      );
    }
    console.log(
      `[seed:volumen] Cuenta: ${ORG.ownerEmail} (contraseña: SEED_DEMO_PASSWORD o la de dev)`,
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[seed:volumen] Error:', error);
    process.exit(1);
  });
}
