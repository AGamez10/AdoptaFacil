import { ForbiddenException } from '@nestjs/common';
import sharp from 'sharp';
import type { ConfigService } from '@nestjs/config';
import type { AuditService } from '../../core/audit/audit.service';
import type { PlansService } from '../../core/plans/plans.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StoragePort } from '../../core/storage/storage.port';
import type { TenantContextService } from '../../core/tenant/tenant-context.service';
import {
  MarketplaceProductsService,
  PRODUCT_IMAGE_TARGET_MAX_BYTES,
} from './marketplace-products.service';

const ORG = '00000000-0000-4000-8000-000000000001';
const PRODUCT = '00000000-0000-4000-8000-000000000002';

/** Plan sin espacio: la subida debe cortarse antes de guardar nada. */
function build(plansReject: Error) {
  const tx = {
    product: { findUnique: jest.fn().mockResolvedValue({ id: PRODUCT }) },
    productImage: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
  };
  const prisma = {
    withOrgContext: jest.fn((_org: string, fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const storage = {
    createUploadTarget: jest.fn(),
    saveObject: jest.fn(),
    deleteObject: jest.fn(),
  } as unknown as jest.Mocked<StoragePort>;
  const plans = {
    assertStorageAvailable: jest.fn().mockRejectedValue(plansReject),
  } as unknown as jest.Mocked<PlansService>;
  const service = new MarketplaceProductsService(
    prisma,
    { getOrganizationId: () => ORG } as unknown as TenantContextService,
    { recordWithTx: jest.fn() } as unknown as AuditService,
    plans,
    storage,
    { get: () => 15 } as unknown as ConfigService<never, true>,
  );
  return { service, tx, storage, plans };
}

async function bigPhoto(): Promise<Buffer> {
  return sharp({
    create: { width: 3000, height: 2000, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe('MarketplaceProductsService — fotos y cuota del plan', () => {
  it('cuenta contra el plan el peso YA comprimido, no el del archivo original', async () => {
    const { service, plans } = build(new ForbiddenException('Sin espacio'));
    const buffer = await bigPhoto();

    await expect(
      service.addImageFile('user', PRODUCT, {
        buffer,
        mimetype: 'image/jpeg',
        size: buffer.length,
        originalname: 'foto.jpg',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const [, bytes] = plans.assertStorageAvailable.mock.calls[0] as [string, number];
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThanOrEqual(PRODUCT_IMAGE_TARGET_MAX_BYTES);
    expect(bytes).toBeLessThan(buffer.length);
  });

  it('si el plan no tiene espacio no guarda bytes ni crea la fila', async () => {
    const { service, tx, storage } = build(new ForbiddenException('Sin espacio'));
    const buffer = await bigPhoto();

    await expect(
      service.addImageFile('user', PRODUCT, {
        buffer,
        mimetype: 'image/jpeg',
        size: buffer.length,
        originalname: 'foto.jpg',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(storage.createUploadTarget).not.toHaveBeenCalled();
    expect(storage.saveObject).not.toHaveBeenCalled();
    expect(tx.productImage.create).not.toHaveBeenCalled();
  });
});
