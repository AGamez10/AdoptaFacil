import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  ClaimResourceOpenOfferResult,
  ResourceCategory,
  ResourceNeed,
  ResourceNeedsOwnPage,
  ResourceOpenOfferBoardItem,
  ResourceOpenOffersBoardPage,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
  buttonVariants,
  cn,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { SelectField } from '../components/resource-form-fields';
import { OPEN_OFFER_CATEGORY_OPTIONS, compatibleNeeds, daysLeft } from '../model/open-offers-view';
import { CATEGORY_LABELS, manageResourceNeedHref } from '../model/resources-view';

const CATEGORY_FILTERS: { value: ResourceCategory | ''; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  ...OPEN_OFFER_CATEGORY_OPTIONS,
];
const NEW_NEED = '__nueva__';

/**
 * `/organizacion/recursos/ofrecimientos` — lo que la gente dejó ofrecido sin
 * una necesidad concreta. Sin identidad del donante; tomarlo lo asocia a una
 * necesidad propia (o publica una nueva) y deja la entrega programada.
 */
export function OpenOffersBoardPage() {
  const client = useApiClient();
  const [category, setCategory] = useState<ResourceCategory | ''>('');
  const [city, setCity] = useState('');
  const [appliedCity, setAppliedCity] = useState('');
  const [page, setPage] = useState<ResourceOpenOffersBoardPage | null>(null);
  const [needs, setNeeds] = useState<ResourceNeed[]>([]);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setPage(null);
    setError(false);
    const params = new URLSearchParams({ limit: '50' });
    if (category) params.set('category', category);
    if (appliedCity) params.set('city', appliedCity);
    client
      .request<ResourceOpenOffersBoardPage>(`/resources/open-offers/board?${params.toString()}`)
      .then((data) => {
        if (active) setPage({ ...data, items: Array.isArray(data?.items) ? data.items : [] });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [client, category, appliedCity, reloadKey]);

  useEffect(() => {
    let active = true;
    client
      .request<Partial<ResourceNeedsOwnPage>>('/resources/needs?limit=50')
      .then((data) => {
        if (active) setNeeds(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client]);

  return (
    <PageContainer>
      <PageHeader
        title="Ofrecimientos de la comunidad"
        description="Personas que tienen algo para donar y no encontraron una necesidad publicada. Si te sirve, tómalo y coordina la entrega."
        actions={
          <Link to="/organizacion/recursos" className={cn(buttonVariants({ variant: 'outline' }))}>
            Mis necesidades
          </Link>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)_auto] sm:items-end">
        <SelectField
          id="board-category"
          label="Tipo"
          value={category}
          onChange={setCategory}
          options={CATEGORY_FILTERS}
        />
        <div className="space-y-1.5">
          <label htmlFor="board-city" className="block text-sm font-medium">
            Municipio
          </label>
          <Input
            id="board-city"
            placeholder="Todos"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setAppliedCity(city.trim());
            }}
          />
        </div>
        <Button variant="outline" onClick={() => setAppliedCity(city.trim())}>
          Filtrar
        </Button>
      </div>

      {!page && !error && <Skeleton className="h-64 w-full" />}
      {error && (
        <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
      )}
      {page && page.items.length === 0 && (
        <EmptyState
          title="Por ahora no hay ofrecimientos abiertos"
          description="Cuando alguien deje algo para donar lo verás aquí. Publicar tus necesidades ayuda a que te encuentren primero."
          action={
            <Link to="/organizacion/recursos" className={cn(buttonVariants())}>
              Publicar una necesidad
            </Link>
          }
        />
      )}
      {page && page.items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Ofrecimientos abiertos">
          {page.items.map((item) => (
            <li key={item.id}>
              <OpenOfferCard
                item={item}
                needs={compatibleNeeds(needs, item)}
                onClaimed={() => setReloadKey((n) => n + 1)}
              />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

function OpenOfferCard({
  item,
  needs,
  onClaimed,
}: {
  item: ResourceOpenOfferBoardItem;
  needs: ResourceNeed[];
  onClaimed: () => void;
}) {
  const client = useApiClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>(needs[0]?.id ?? NEW_NEED);
  const [needTitle, setNeedTitle] = useState(item.title);
  const [saving, setSaving] = useState(false);

  const claim = async (): Promise<void> => {
    setSaving(true);
    try {
      const result = await client.request<ClaimResourceOpenOfferResult>(
        `/resources/open-offers/${item.id}/claim`,
        {
          method: 'POST',
          json:
            target === NEW_NEED
              ? { needTitle: needTitle.trim() || item.title }
              : { needId: target },
        },
      );
      toast({
        title: 'Ofrecimiento tomado',
        description: 'Le avisamos a la persona. Coordina la entrega desde la necesidad.',
        variant: 'success',
      });
      onClaimed();
      navigate(manageResourceNeedHref(result.needId));
    } catch (error) {
      toast({
        title: 'No se pudo tomar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
      onClaimed();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="open-offer-card" className="h-full">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="info">{CATEGORY_LABELS[item.category]}</Badge>
          <Badge variant="secondary">
            {item.city}, {item.department}
          </Badge>
          {item.fromYourOrganization && <Badge variant="outline">De tu equipo</Badge>}
        </div>
        <CardTitle className="text-base">{item.title}</CardTitle>
        <p className="text-sm font-medium">
          {item.quantity} {item.unit}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
        <p className="text-xs text-muted-foreground">
          Disponible {daysLeft(item.expiresAt)} días más.
        </p>
        {item.fromYourOrganization ? (
          <p className="text-xs text-muted-foreground" data-testid="open-offer-own">
            Lo ofreció alguien de tu equipo: lo ven las demás organizaciones y el público en el
            banco de recursos. Tu organización no puede tomarlo.
          </p>
        ) : !open ? (
          <Button onClick={() => setOpen(true)}>Me sirve, tomarlo</Button>
        ) : (
          <div className="space-y-3 rounded-md border border-border p-3">
            <SelectField
              id={`claim-target-${item.id}`}
              label="¿Para cuál necesidad?"
              value={target}
              onChange={setTarget}
              options={[
                ...needs.map((need) => ({ value: need.id, label: need.title })),
                { value: NEW_NEED, label: 'Publicar una necesidad nueva con esto' },
              ]}
            />
            {needs.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No tienes necesidades activas de este tipo en {item.unit}; se publicará una nueva.
              </p>
            )}
            {target === NEW_NEED && (
              <div className="space-y-1.5">
                <label htmlFor={`claim-title-${item.id}`} className="block text-sm font-medium">
                  Título de la necesidad
                </label>
                <Input
                  id={`claim-title-${item.id}`}
                  maxLength={200}
                  value={needTitle}
                  onChange={(e) => setNeedTitle(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving} onClick={() => void claim()}>
                {saving ? 'Tomando…' : 'Confirmar'}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
