import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Product as ProductRow, ProductImage as ProductImageRow } from '@prisma/client';
import {
  type CreateProductInput,
  type Product,
  type ProductCategory,
  type ProductImage,
  type ProductImageUploadResult,
  type ProductsPage,
  type UpdateProductInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import type { Env } from '../../config/env.validation';
import { PlansService } from '../../core/plans/plans.service';
import { optimizeImage, sniffImageContentType } from '../../core/storage/image-optimizer';
import { isUniqueConstraintViolation } from '../../core/errors/prisma-conflict.util';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { TenantContextService } from '../../core/tenant/tenant-context.service';

const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;

/** Clamp a requested page size to [1, MAX_PAGE] — shared by every list read
 *  in this module (org catalog, public catalog). */
export function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE);
}

type ProductWithImages = ProductRow & { images: ProductImageRow[] };

/** Un producto lleva UNA sola foto: es lo que se ve en la tarjeta y en el detalle. */
export const MAX_PRODUCT_IMAGES = 1;
/** Tipos de foto que se aceptan, comprobados por sus bytes (no por la extensión). */
const PRODUCT_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
/** Las fotos de producto se ven en tarjetas pequeñas: más livianas que el resto. */
export const PRODUCT_IMAGE_MAX_EDGE_PX = 1200;
export const PRODUCT_IMAGE_TARGET_MAX_BYTES = 250 * 1024;

/** Archivo de multer en memoria (sin @types/multer). */
export interface UploadedProductImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/**
 * M10 (marketplace simplificado) — catálogo de productos físicos por
 * organización. Sin carrito, sin checkout, sin dependencia del PaymentPort: la
 * venta ocurre fuera de la plataforma (contacto por WhatsApp). Tenant-scoped
 * (RLS): create/list/get/update/imágenes siempre bajo `withOrgContext`. Un
 * producto NUNCA se borra físicamente — `isActive` es el toggle de baja.
 */
@Injectable()
export class MarketplaceProductsService {
  private readonly logger = new Logger(MarketplaceProductsService.name);
  private readonly maxMb: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    config: ConfigService<Env, true>,
  ) {
    this.maxMb = config.get('STORAGE_MAX_FILE_MB', { infer: true });
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  private toImage(row: ProductImageRow): ProductImage {
    return {
      id: row.id,
      storageRef: row.storageRef,
      order: row.order,
      url: this.storage.resolvePublicUrl(row.storageRef),
    };
  }

  private toProduct(row: ProductWithImages): Product {
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      description: row.description ?? undefined,
      category: row.category as ProductCategory,
      price: row.price,
      stock: row.stock,
      isActive: row.isActive,
      images: [...row.images].sort((a, b) => a.order - b.order).map((i) => this.toImage(i)),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Publicar un producto (con fotos opcionales); auditado. Falla con 409 si
   *  ya existe un producto con el mismo nombre en esta organización. */
  async create(actorUserId: string, input: CreateProductInput): Promise<Product> {
    const organizationId = this.requireOrgId();
    const name = input.name.trim();

    // Reserve storage targets OUTSIDE the tx (mirrors animals.service create).
    const reserved = await Promise.all(
      (input.images ?? []).map(async (image, index) => ({
        storageRef: (
          await this.storage.createUploadTarget({
            organizationId,
            filename: image.filename,
            contentType: image.contentType,
            // Product photos are public (shown in the public catalog).
            visibility: 'public',
          })
        ).key,
        order: image.order ?? index,
      })),
    );

    try {
      return await this.prisma.withOrgContext(organizationId, async (tx) => {
        const row = await tx.product.create({
          data: {
            organizationId,
            name,
            description: input.description ?? null,
            category: input.category,
            price: input.price,
            stock: input.stock ?? 0,
            images:
              reserved.length > 0
                ? { create: reserved.map((r) => ({ organizationId, ...r })) }
                : undefined,
          },
          include: { images: true },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: 'product.created',
          entityType: 'product',
          entityId: row.id,
          metadata: { category: input.category, price: input.price, images: reserved.length },
        });
        return this.toProduct(row);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          `Ya existe un producto llamado "${name}" en esta organización.`,
        );
      }
      throw error;
    }
  }

  /** Página de productos de la organización, más recientes primero. Por
   *  defecto solo los activos; filtro opcional por categoría. */
  async list(opts: {
    includeInactive?: boolean;
    category?: ProductCategory;
    limit?: number;
    offset?: number;
  }): Promise<ProductsPage> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(opts.limit);
    const skip = Math.max(opts.offset || 0, 0);
    const where = {
      organizationId,
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.category ? { category: opts.category } : {}),
    };
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.product.findMany({
          where,
          include: { images: true },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        tx.product.count({ where }),
      ]);
      return { items: rows.map((r) => this.toProduct(r)), total, limit: take, offset: skip };
    });
  }

  /** Un producto de la organización (activo o no). */
  async get(id: string): Promise<Product> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.product.findUnique({ where: { id }, include: { images: true } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Product not found');
    }
    return this.toProduct(row);
  }

  /** Editar un producto (incl. activar/desactivar vía `isActive`); auditado.
   *  Falla con 409 si el nuevo nombre choca con otro producto de la misma
   *  organización. */
  async update(actorUserId: string, id: string, input: UpdateProductInput): Promise<Product> {
    const organizationId = this.requireOrgId();
    try {
      return await this.prisma.withOrgContext(organizationId, async (tx) => {
        const existing = await tx.product.findUnique({ where: { id } });
        if (!existing) {
          throw new NotFoundException('Product not found');
        }
        const updated = await tx.product.update({
          where: { id },
          data: {
            name: input.name?.trim(),
            description: input.description,
            category: input.category,
            price: input.price,
            stock: input.stock,
            isActive: input.isActive,
          },
          include: { images: true },
        });
        const activationChanged =
          input.isActive !== undefined && input.isActive !== existing.isActive;
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: activationChanged ? 'product.activation_changed' : 'product.updated',
          entityType: 'product',
          entityId: id,
          metadata: activationChanged
            ? { from: existing.isActive, to: input.isActive }
            : { fields: Object.keys(input) },
        });
        return this.toProduct(updated);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          `Ya existe un producto llamado "${input.name?.trim()}" en esta organización.`,
        );
      }
      throw error;
    }
  }

  // --- Images ------------------------------------------------------------

  /** Agregar una foto a un producto (solo metadata); auditado. */
  async addImage(
    actorUserId: string,
    productId: string,
    input: { filename: string; contentType?: string; order?: number },
  ): Promise<ProductImageUploadResult> {
    const organizationId = this.requireOrgId();
    const stored = await this.storage.createUploadTarget({
      organizationId,
      filename: input.filename,
      contentType: input.contentType,
      // Product photos are public (shown in the public catalog).
      visibility: 'public',
    });
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      if ((await tx.productImage.count({ where: { productId } })) >= MAX_PRODUCT_IMAGES) {
        throw new ConflictException(
          'Este producto ya tiene foto. Usa "Cambiar foto" para reemplazarla.',
        );
      }
      const order =
        input.order ??
        ((await tx.productImage.aggregate({ where: { productId }, _max: { order: true } }))._max
          .order ?? -1) + 1;
      const row = await tx.productImage.create({
        data: { organizationId, productId, storageRef: stored.key, order },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'product.image_added',
        entityType: 'product',
        entityId: productId,
        metadata: { order },
      });
      return { image: this.toImage(row), upload: { url: stored.url, key: stored.key } };
    });
  }

  /** Quitar una foto de un producto; auditado. */
  async removeImage(actorUserId: string, productId: string, imageId: string): Promise<void> {
    const organizationId = this.requireOrgId();
    const removedRef = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const image = await tx.productImage.findUnique({ where: { id: imageId } });
      if (!image || image.productId !== productId) {
        throw new NotFoundException('Image not found');
      }
      await tx.productImage.delete({ where: { id: imageId } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'product.image_removed',
        entityType: 'product',
        entityId: productId,
        metadata: { imageId },
      });
      return image.storageRef;
    });
    await this.deleteStoredBytes([removedRef]);
  }

  /**
   * Pone (o reemplaza) LA foto del producto en un solo paso: valida el archivo,
   * lo recomprime a WebP liviano, revisa la cuota de espacio del plan, guarda
   * los bytes y solo entonces cambia la fila. Si algo falla antes, el producto
   * conserva la foto que tenía; la anterior se borra del almacenamiento después.
   */
  async setImage(
    actorUserId: string,
    productId: string,
    file: UploadedProductImage | undefined,
  ): Promise<Product> {
    const organizationId = this.requireOrgId();
    if (!file?.buffer || file.size === 0) {
      throw new BadRequestException('Elige una foto para subir.');
    }
    if (file.size > this.maxMb * 1024 * 1024) {
      throw new PayloadTooLargeException(`La foto supera el límite de ${this.maxMb} MB.`);
    }
    const sniffed = sniffImageContentType(file.buffer);
    if (!sniffed || !PRODUCT_IMAGE_TYPES.includes(sniffed)) {
      throw new BadRequestException('La foto debe ser JPG, PNG o WebP.');
    }
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      if (!(await tx.product.findUnique({ where: { id: productId }, select: { id: true } }))) {
        throw new NotFoundException('Product not found');
      }
    });

    const optimized = await optimizeImage(file.buffer, sniffed, {
      maxEdgePx: PRODUCT_IMAGE_MAX_EDGE_PX,
      targetMaxBytes: PRODUCT_IMAGE_TARGET_MAX_BYTES,
    });
    if (!optimized) {
      throw new BadRequestException('No pudimos leer esa foto. Prueba con otra imagen.');
    }
    await this.plans.assertStorageAvailable(organizationId, optimized.buffer.length);
    const extension = optimized.contentType === 'image/webp' ? 'webp' : sniffed.split('/')[1];
    const stored = await this.storage.createUploadTarget({
      organizationId,
      filename: `producto.${extension}`,
      contentType: optimized.contentType,
      visibility: 'public',
    });
    await this.storage.saveObject(stored.key, optimized.buffer, optimized.contentType);

    let replaced: string[] = [];
    try {
      replaced = await this.prisma.withOrgContext(organizationId, async (tx) => {
        const previous = await tx.productImage.findMany({ where: { productId } });
        await tx.productImage.deleteMany({ where: { productId } });
        await tx.productImage.create({
          data: { organizationId, productId, storageRef: stored.key, order: 0 },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: previous.length > 0 ? 'product.image_replaced' : 'product.image_added',
          entityType: 'product',
          entityId: productId,
          metadata: { bytes: optimized.buffer.length },
        });
        return previous.map((row) => row.storageRef);
      });
    } catch (error) {
      await this.deleteStoredBytes([stored.key]);
      throw error;
    }
    await this.deleteStoredBytes(replaced);
    return this.get(productId);
  }

  /** Borra bytes que ya nada referencia. Best-effort: un fallo aquí no deshace
   *  el cambio, solo queda registrado. */
  private async deleteStoredBytes(keys: string[]): Promise<void> {
    if (!this.storage.deleteObject) return;
    for (const key of keys) {
      try {
        await this.storage.deleteObject(key);
      } catch (error) {
        this.logger.warn(`No se pudo borrar ${key}: ${(error as Error).message}`);
      }
    }
  }
}
