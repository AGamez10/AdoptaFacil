import { useEffect, useState } from 'react';
import { ResourceOpenOfferStatus, type ResourceOpenOffer } from '@adoptafacil/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { daysLeft, openOfferStatusLabel, openOfferStatusVariant } from '../model/open-offers-view';

/** "Mis ofrecimientos abiertos" dentro de "Mis ofertas". Sin ofrecimientos, no se muestra. */
export function MyOpenOffers() {
  const client = useApiClient();
  const { toast } = useToast();
  const [items, setItems] = useState<ResourceOpenOffer[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    client
      .request<ResourceOpenOffer[]>('/resources/open-offers/mine')
      .then((rows) => {
        if (active) setItems(Array.isArray(rows) ? rows : []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, reloadKey]);

  if (items.length === 0) return null;

  const withdraw = async (id: string): Promise<void> => {
    try {
      await client.request(`/resources/open-offers/${id}/withdraw`, { method: 'PATCH' });
      toast({ title: 'Ofrecimiento retirado', variant: 'success' });
      setReloadKey((n) => n + 1);
    } catch (error) {
      toast({
        title: 'No se pudo retirar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <section className="mb-8 space-y-3" aria-labelledby="my-open-offers-title">
      <h2 id="my-open-offers-title" className="text-base font-semibold">
        Lo que dejaste ofrecido
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((offer) => (
          <li key={offer.id}>
            <Card data-testid="my-open-offer">
              <CardHeader className="gap-1">
                <CardTitle className="text-base">{offer.title}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {offer.quantity} {offer.unit} · {offer.city}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <Badge variant={openOfferStatusVariant(offer)}>{openOfferStatusLabel(offer)}</Badge>
                {offer.claimedByOrganizationName && (
                  <p className="text-sm">
                    {offer.claimedByOrganizationName} lo tomó. Verás la entrega en tus ofertas de
                    abajo.
                  </p>
                )}
                {offer.status === ResourceOpenOfferStatus.Open && !offer.expired && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Visible {daysLeft(offer.expiresAt)} días más.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => void withdraw(offer.id)}>
                      Retirar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
