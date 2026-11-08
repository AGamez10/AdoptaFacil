import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  OPEN_OFFER_TTL_DAYS,
  ResourceCategory,
  type CreateResourceOpenOfferInput,
  type ResourceOpenOffer,
} from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  buttonVariants,
  cn,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import {
  DEPARTMENTS,
  OTHER_CITY_VALUE,
  citiesForDepartment,
} from '../../org/data/colombian-locations';
import { SelectField, TextAreaField } from '../components/resource-form-fields';
import { OPEN_OFFER_CATEGORY_OPTIONS } from '../model/open-offers-view';

const DEPARTMENT_OPTIONS = [
  { value: '', label: 'Elige el departamento' },
  ...DEPARTMENTS.map((d) => ({ value: d.value, label: d.label })),
];

/**
 * `/tengo-para-donar` — alguien tiene algo para donar y no encontró una
 * necesidad publicada que calce. Lo deja en el banco: las organizaciones lo
 * ven sin su nombre ni sus datos y, si una lo toma, sigue el flujo normal en
 * "Mis ofertas". La sesión la exige el `<RequireAuth>` de la ruta padre.
 */
export function OpenOfferPage() {
  const client = useApiClient();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ResourceCategory>(ResourceCategory.Supplies);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('unidades');
  const [department, setDepartment] = useState('');
  const [city, setCity] = useState('');
  const [otherCity, setOtherCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<ResourceOpenOffer | null>(null);

  const cities = citiesForDepartment(department);
  const cityOptions = [
    { value: '', label: department ? 'Elige el municipio' : 'Primero el departamento' },
    ...cities.map((c) => ({ value: c, label: c })),
    ...(department ? [{ value: OTHER_CITY_VALUE, label: 'Otro municipio' }] : []),
  ];
  const finalCity = city === OTHER_CITY_VALUE ? otherCity.trim() : city;

  const submit = async (): Promise<void> => {
    const amount = Number(quantity);
    if (
      title.trim().length < 3 ||
      !unit.trim() ||
      !department ||
      finalCity.length < 2 ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      toast({
        title: 'Faltan datos',
        description: 'Cuéntanos qué es, cuánto (un número entero), la unidad y tu municipio.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const body: CreateResourceOpenOfferInput = {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        category,
        quantity: amount,
        unit: unit.trim(),
        department,
        city: finalCity,
      };
      setDone(
        await client.request<ResourceOpenOffer>('/resources/open-offers', {
          method: 'POST',
          json: body,
        }),
      );
    } catch (error) {
      toast({
        title: 'No se pudo guardar tu ofrecimiento',
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
        title="Tengo algo para donar"
        description="¿No viste una necesidad que calce con lo que tienes? Déjalo aquí y las organizaciones lo verán."
      />
      {done ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="¡Listo! Tu ofrecimiento ya está en el banco"
              description={`Las organizaciones de ${done.city} y del resto del país lo verán durante ${OPEN_OFFER_TTL_DAYS} días, sin tu nombre ni tus datos. Si una lo toma, te avisamos por correo y lo verás en "Mis ofertas" para coordinar la entrega.`}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link to="/mis-ofertas" className={cn(buttonVariants())}>
                    Ver mis ofertas
                  </Link>
                  <Link to="/adoptar" className={cn(buttonVariants({ variant: 'outline' }))}>
                    Mientras tanto, conoce a los animales
                  </Link>
                </div>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">¿Qué quieres donar?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="open-offer-title" className="block text-sm font-medium">
                  Qué es
                </label>
                <Input
                  id="open-offer-title"
                  maxLength={120}
                  placeholder="Ej.: Cobijas medianas, bulto de concentrado para gatos"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <SelectField
                id="open-offer-category"
                label="Tipo"
                value={category}
                onChange={setCategory}
                options={OPEN_OFFER_CATEGORY_OPTIONS}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="open-offer-quantity" className="block text-sm font-medium">
                    Cantidad
                  </label>
                  <Input
                    id="open-offer-quantity"
                    type="number"
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="open-offer-unit" className="block text-sm font-medium">
                    Unidad
                  </label>
                  <Input
                    id="open-offer-unit"
                    maxLength={40}
                    placeholder="unidades, kg, bultos…"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="open-offer-department"
                  label="Departamento"
                  value={department}
                  onChange={(value) => {
                    setDepartment(value);
                    setCity('');
                  }}
                  options={DEPARTMENT_OPTIONS}
                />
                <SelectField
                  id="open-offer-city"
                  label="Municipio"
                  value={city}
                  onChange={setCity}
                  options={cityOptions}
                />
              </div>
              {city === OTHER_CITY_VALUE && (
                <div className="space-y-1.5">
                  <label htmlFor="open-offer-other-city" className="block text-sm font-medium">
                    ¿Cuál municipio?
                  </label>
                  <Input
                    id="open-offer-other-city"
                    maxLength={80}
                    value={otherCity}
                    onChange={(e) => setOtherCity(e.target.value)}
                  />
                </div>
              )}
              <TextAreaField
                id="open-offer-description"
                label="Detalles (opcional)"
                value={description}
                onChange={setDescription}
                placeholder="Estado, tamaño, si puedes llevarlo o necesitas que lo recojan…"
              />
              <Button disabled={saving} onClick={() => void submit()}>
                {saving ? 'Guardando…' : 'Dejar mi ofrecimiento'}
              </Button>
            </CardContent>
          </Card>
          <aside className="space-y-3 text-sm text-muted-foreground" aria-label="Cómo funciona">
            <p className="font-medium text-foreground">Cómo funciona</p>
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                Las organizaciones ven qué es, cuánto y en qué municipio. Nunca tu nombre, correo ni
                teléfono.
              </li>
              <li>Si una lo necesita, lo toma y te avisamos por correo.</li>
              <li>
                La entrega se coordina desde "Mis ofertas", con el mismo seguimiento de cualquier
                donación del banco.
              </li>
            </ol>
            <p>
              Sigue visible {OPEN_OFFER_TTL_DAYS} días y puedes retirarlo cuando quieras. Los
              medicamentos solo se reciben cuando una organización los pide en una necesidad.
            </p>
          </aside>
        </div>
      )}
    </PageContainer>
  );
}
