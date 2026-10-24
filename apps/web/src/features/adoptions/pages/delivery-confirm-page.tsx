import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { AdoptionDelivery } from '@adoptafacil/contracts';
import { Button, Card, CardContent, ErrorState, Input, Skeleton } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { ApiError, useApiClient } from '../../../shell/api';
import { confirmAdoptionDelivery, getMyDelivery } from '../api/adoptions-api';
import { AnimalRecordCard } from '../components/animal-record-card';
import { DELIVERY_ITEM_LABELS } from '../model/adoptions-delivery-view';

const ERROR_MESSAGES: Record<string, string> = {
  DELIVERY_CODE_INVALID: 'El código no coincide. Revísalo e inténtalo de nuevo.',
  DELIVERY_CODE_EXPIRED: 'El código venció. Pide a la organización que genere uno nuevo.',
  DELIVERY_CODE_LOCKED: 'Hubo demasiados intentos. Pide a la organización un código nuevo.',
};

/**
 * Confirmación de la entrega por el ADOPTANTE (ajuste 6). Llega aquí al
 * escanear el QR (el código viene en el enlace) o desde el correo; ve el
 * resumen y toca "Confirmo que recibí a …". Al confirmar ve la ficha.
 */
export function DeliveryConfirmPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const client = useApiClient();

  const [delivery, setDelivery] = useState<AdoptionDelivery | null | undefined>(undefined);
  const [code, setCode] = useState(params.get('codigo')?.replace(/\D/g, '').slice(0, 6) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyDelivery(client, id)
      .then(setDelivery)
      .catch(() => setDelivery(null));
  }, [client, id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Escribe los 6 dígitos del código.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setDelivery(await confirmAdoptionDelivery(client, id, code));
    } catch (e) {
      setError(
        (ApiError.is(e) && ERROR_MESSAGES[e.code]) ||
          (e instanceof Error ? e.message : 'No se pudo confirmar la entrega.'),
      );
    } finally {
      setBusy(false);
    }
  };

  if (delivery === undefined) {
    return (
      <PageContainer>
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  if (!delivery) {
    return (
      <PageContainer>
        <ErrorState
          title="No encontramos esta entrega"
          description="Revisa que hayas iniciado sesión con la cuenta con la que firmaste el contrato."
        />
      </PageContainer>
    );
  }

  if (delivery.status === 'confirmed') {
    return (
      <PageContainer>
        <PageHeader
          title={`¡${delivery.animalName} ya está en casa!`}
          description="La entrega quedó confirmada. Esta es su ficha; también la encuentras en Mis animales."
        />
        <div className="space-y-4">
          <AnimalRecordCard delivery={delivery} />
          <Link
            to="/mis-seguimientos"
            className="inline-block font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver mis seguimientos →
          </Link>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={`Entrega de ${delivery.animalName}`}
        description={`${delivery.record.organizationName} registró la entrega. Revisa el resumen y confírmala.`}
      />
      <Card>
        <CardContent className="space-y-4 pt-6 text-sm">
          <dl className="space-y-2">
            <div>
              <dt className="font-medium">Estado de salud</dt>
              <dd>{delivery.details.healthStatus}</dd>
            </div>
            <div>
              <dt className="font-medium">Peso</dt>
              <dd>{delivery.details.weightKg} kg</dd>
            </div>
            {delivery.details.items.length > 0 && (
              <div>
                <dt className="font-medium">Recibes</dt>
                <dd>{delivery.details.items.map((i) => DELIVERY_ITEM_LABELS[i]).join(', ')}</dd>
              </div>
            )}
          </dl>
          <form className="space-y-3" onSubmit={(e) => void submit(e)} noValidate>
            <label className="block space-y-1">
              <span className="font-medium">Código de confirmación</span>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? 'Confirmando…' : `Confirmo que recibí a ${delivery.animalName}`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
