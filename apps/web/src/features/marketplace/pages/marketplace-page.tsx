import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type CreateProductInput,
  type Organization,
  PRODUCT_CATEGORIES,
  ProductCategory,
  type Product,
  type ProductsPage as ProductsPageDto,
  Role,
} from '@adoptafacil/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { SelectField, TextAreaField } from '../components/product-form-fields';
import { ProductManageCard } from '../components/product-manage-card';
import { ProductPhotoField } from '../components/product-photo-field';
import { uploadProductImage, validateImageUpload } from '../lib/storage';
import { CATEGORY_LABELS } from '../model/marketplace-view';

const CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

/**
 * `/organizacion/marketplace` (M10, F-7) — gestión del catálogo de productos
 * de la organización, usando SOLO endpoints ya existentes (`GET`/`POST
 * /marketplace/products`). Crear/editar: Owner/Administrator/Operator; ver:
 * + ReadOnlyAuditor (calcado de `MarketplaceProductsController`'s @Roles).
 */
export function MarketplacePage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator) || hasRole(Role.Operator);
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProductCategory>(ProductCategory.Food);
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // El comprador contacta a la organización por el WhatsApp de su perfil: sin
  // él, el producto se ve en el marketplace pero nadie puede pedirlo.
  const [missingWhatsapp, setMissingWhatsapp] = useState(false);

  // ⚠️ Blindaje anti-regresión (patrón de public-campaigns.ts): SIEMPRE se
  // normaliza `.items` a `[]` si la respuesta no trae un array.
  const load = async (): Promise<void> => {
    const page = await client.request<Partial<ProductsPageDto>>(
      '/marketplace/products?limit=50&includeInactive=true',
    );
    setProducts(Array.isArray(page?.items) ? page.items : []);
  };

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const choosePhoto = (file: File): void => {
    const invalid = validateImageUpload(file);
    if (invalid) {
      toast({ title: 'Foto no válida', description: invalid, variant: 'warning' });
      return;
    }
    setPhoto(file);
  };

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    client
      .request<Organization>('/org/profile')
      .then((org) => {
        if (active) setMissingWhatsapp(!org?.whatsapp?.trim());
      })
      .catch(() => {
        // Best-effort: sin perfil no se muestra el aviso.
      });
    return () => {
      active = false;
    };
  }, [client, canManage]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const page = await client.request<Partial<ProductsPageDto>>(
          '/marketplace/products?limit=50&includeInactive=true',
        );
        if (active) setProducts(Array.isArray(page?.items) ? page.items : []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const resetForm = (): void => {
    setName('');
    setDescription('');
    setCategory(ProductCategory.Food);
    setPrice('');
    setStock('');
    setPhoto(null);
  };

  const submit = async (): Promise<void> => {
    const priceValue = Number(price);
    const stockValue = stock.trim() ? Number(stock) : undefined;
    if (
      !name.trim() ||
      !Number.isInteger(priceValue) ||
      priceValue <= 0 ||
      (stockValue !== undefined && (!Number.isInteger(stockValue) || stockValue < 0))
    ) {
      toast({
        title: 'Datos incompletos',
        description:
          'Nombre, categoría y precio (entero COP > 0) son obligatorios; el stock no puede ser negativo.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const body: CreateProductInput = {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        category,
        price: priceValue,
        ...(stockValue !== undefined ? { stock: stockValue } : {}),
      };
      const created = await client.request<Product>('/marketplace/products', {
        method: 'POST',
        json: body,
      });
      let photoError: string | null = null;
      if (photo) {
        try {
          await uploadProductImage(client, created.id, photo);
        } catch (error) {
          photoError = error instanceof Error ? error.message : 'Inténtalo de nuevo.';
        }
      }
      resetForm();
      setShowForm(false);
      await load();
      if (photoError) {
        toast({
          title: 'Producto publicado, pero la foto no se pudo subir',
          description: `${photoError} Puedes subirla desde "Ver detalle".`,
          variant: 'warning',
        });
      } else {
        toast({ title: 'Producto publicado', variant: 'success' });
      }
    } catch (error) {
      toast({
        title: 'No se pudo publicar el producto',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Marketplace"
        description="Publica productos físicos de tu organización. El contacto y la venta ocurren por WhatsApp, fuera de la plataforma."
        actions={canManage && <Button onClick={() => setShowForm(true)}>Publicar producto</Button>}
      />
      {missingWhatsapp && (
        <p
          role="status"
          data-testid="marketplace-missing-whatsapp"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Tus productos se ven en el marketplace, pero los compradores aún no tienen cómo
          escribirte: agrega el WhatsApp de la organización en{' '}
          <Link to="/organizacion" className="font-semibold underline">
            el perfil
          </Link>
          . La plataforma no cobra en línea; el pago y la entrega se acuerdan por WhatsApp.
        </p>
      )}
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-6">
          {products.length === 0 ? (
            <EmptyState
              icon={<span aria-hidden>🛍️</span>}
              title="Aún no hay productos publicados"
              description={
                canManage ? 'Publica tu primer producto para empezar a vender.' : undefined
              }
              action={
                canManage ? (
                  <Button onClick={() => setShowForm(true)}>Publicar tu primer producto</Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <ProductManageCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={canManage && showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="product-name" className="block text-sm font-medium text-foreground">
                Nombre
              </label>
              <Input
                id="product-name"
                placeholder="Nombre del producto"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <TextAreaField
              id="product-description"
              label="Descripción"
              value={description}
              onChange={setDescription}
              placeholder="Cuéntale al comprador de qué se trata…"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                id="product-category"
                label="Categoría"
                value={category}
                onChange={setCategory}
                options={CATEGORY_OPTIONS}
              />
              <div className="space-y-1.5">
                <label
                  htmlFor="product-price"
                  className="block text-sm font-medium text-foreground"
                >
                  Precio (COP)
                </label>
                <Input
                  id="product-price"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Precio en pesos"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="product-stock" className="block text-sm font-medium text-foreground">
                Stock (opcional, 0 por defecto)
              </label>
              <Input
                id="product-stock"
                type="number"
                min={0}
                step={1}
                placeholder="Unidades disponibles"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Foto (opcional)</p>
              <ProductPhotoField
                imageUrl={photoPreview}
                alt="Vista previa de la foto del producto"
                canManage
                busy={saving}
                onSelect={choosePhoto}
                onRemove={() => setPhoto(null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? 'Publicando…' : 'Publicar producto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
