import { Link } from 'react-router-dom';
import type { ResourceOpenOfferPublic } from '@adoptafacil/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  buttonVariants,
  cn,
} from '@adoptafacil/ui';
import { CATEGORY_LABELS } from '../model/resources-view';
import { OPEN_OFFER_PATH, OPEN_OFFERS_BOARD_PATH, daysLeft } from '../model/open-offers-view';

/**
 * "Lo que la gente está ofreciendo" en el banco PÚBLICO: ofrecimientos
 * abiertos sin el nombre ni los datos de quien ofrece. Una organización entra
 * al tablero (pide sesión) para tomarlo; cualquiera puede sumar el suyo.
 */
export function PublicOpenOffers({ items }: { items: ResourceOpenOfferPublic[] }) {
  if (items.length === 0) return null;
  return (
    <section
      className="space-y-4"
      aria-labelledby="public-open-offers-title"
      data-testid="public-open-offers"
    >
      <div className="space-y-1">
        <h2 id="public-open-offers-title" className="text-lg font-semibold tracking-tight">
          Lo que la gente está ofreciendo
        </h2>
        <p className="text-sm text-muted-foreground">
          Donaciones listas para entregar. Si a tu organización le sirve alguna, tómala desde el
          tablero de ofrecimientos y coordinamos la entrega.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Ofrecimientos abiertos">
        {items.map((item) => (
          <li key={item.id}>
            <Card data-testid="public-open-offer-card" className="h-full">
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="info">{CATEGORY_LABELS[item.category]}</Badge>
                  <Badge variant="secondary">
                    {item.city}, {item.department}
                  </Badge>
                </div>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <p className="text-sm font-medium">
                  {item.quantity} {item.unit}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {item.description && (
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Disponible {daysLeft(item.expiresAt)} días más.
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Link to={OPEN_OFFERS_BOARD_PATH} className={cn(buttonVariants())}>
          Soy organización: tomar un ofrecimiento
        </Link>
        <Link to={OPEN_OFFER_PATH} className={cn(buttonVariants({ variant: 'outline' }))}>
          Ofrecer algo yo también
        </Link>
      </div>
    </section>
  );
}
