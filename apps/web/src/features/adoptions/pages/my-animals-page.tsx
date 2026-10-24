import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdoptionDelivery } from '@adoptafacil/contracts';
import { Card, CardContent, EmptyState, ErrorState, Skeleton } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { listMyDeliveries } from '../api/adoptions-api';
import { AnimalRecordCard } from '../components/animal-record-card';

/**
 * "Mis animales" (ajuste 6): las fichas de los animales que el adoptante ya
 * recibió (entrega confirmada) y, arriba, las entregas que esperan su
 * confirmación. El carné solo se ve desde la entrega confirmada, nunca antes.
 */
export function MyAnimalsPage() {
  const client = useApiClient();
  const [deliveries, setDeliveries] = useState<AdoptionDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    listMyDeliveries(client)
      .then((body) => setDeliveries(Array.isArray(body) ? body : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => load(), [load]);

  const pending = deliveries.filter((d) => d.status === 'pending_confirmation');
  const confirmed = deliveries.filter((d) => d.status === 'confirmed');

  return (
    <PageContainer>
      <PageHeader
        title="Mis animales"
        description="La ficha de cada animal que adoptaste: vacunas, cuidados y lo que recibiste en la entrega."
      />
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <ErrorState
          title="No se pudieron cargar tus animales"
          description="Inténtalo de nuevo en unos minutos."
          onRetry={load}
        />
      ) : deliveries.length === 0 ? (
        <EmptyState
          title="Aún no tienes animales en casa"
          description="Cuando confirmes la entrega de tu adopción, su ficha aparecerá aquí."
        />
      ) : (
        <div className="space-y-4">
          {pending.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm">
                <p className="flex-1">
                  <span className="font-medium">{d.animalName}</span> te espera: confirma que lo
                  recibiste.
                </p>
                <Link
                  to={`/mis-adopciones/entrega/${d.id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Confirmar la entrega →
                </Link>
              </CardContent>
            </Card>
          ))}
          {confirmed.map((d) => (
            <AnimalRecordCard key={d.id} delivery={d} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
