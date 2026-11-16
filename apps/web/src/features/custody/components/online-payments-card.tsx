import { useState } from 'react';
import {
  CUSTODY_ONLINE_PAYMENT_TERMS,
  type CustodyOnlinePaymentSettings,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  friendlyErrorMessage,
  useToast,
} from '@adoptafacil/ui';
import { Link } from 'react-router-dom';
import type { CustodyApi } from '../api/custody-api';
import { formatInstant } from '../model/custody-view';
import { CheckField, Notice } from './form-kit';

/**
 * Interruptor del pago en línea de guardería y custodia. Apagado por defecto:
 * lo enciende una persona con rol de administración, aceptando que facturar y
 * responder por los impuestos de estos cobros es asunto de la organización.
 */
export function OnlinePaymentsCard({
  api,
  settings,
  canManage,
  onChanged,
}: {
  api: CustodyApi;
  settings: CustodyOnlinePaymentSettings;
  canManage: boolean;
  onChanged: (settings: CustodyOnlinePaymentSettings) => void;
}) {
  const { toast } = useToast();
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (enabled: boolean) => {
    setBusy(true);
    try {
      const next = await api.updateOnlinePaymentSettings(
        enabled ? { enabled: true, acceptResponsibility: true } : { enabled: false },
      );
      onChanged(next);
      setAccepting(false);
      setAccepted(false);
      toast({
        title: enabled
          ? 'Pago en línea encendido. Ya puedes compartir enlaces de pago.'
          : 'Pago en línea apagado. Los enlaces ya compartidos dejan de recibir pagos.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: friendlyErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Pago en línea por Mercado Pago
          <Badge variant={settings.enabled ? 'success' : 'outline'}>
            {settings.enabled ? 'Encendido' : 'Apagado'}
          </Badge>
        </CardTitle>
        <CardDescription>
          El responsable paga un cobro desde un enlace, sin cuenta en AdoptaFácil. El dinero llega
          directo a la cuenta de Mercado Pago de la organización y el pago queda registrado solo,
          con su constancia. AdoptaFácil no cobra comisión.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!settings.canCollect && (
          <Notice tone="warning">
            La organización todavía no tiene conectada su cuenta de Mercado Pago. Conéctala en{' '}
            <Link className="underline underline-offset-4" to="/organizacion?tab=pagos">
              Organización, pestaña Pagos
            </Link>{' '}
            para poder recibir pagos en línea.
          </Notice>
        )}
        {settings.enabled && settings.acceptedAt && (
          <p className="text-muted-foreground">
            Lo encendió {settings.acceptedByName ?? 'la organización'} el{' '}
            {formatInstant(settings.acceptedAt)}, aceptando las condiciones.
          </p>
        )}

        {accepting && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="font-medium">Antes de encenderlo, la organización acepta que:</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {CUSTODY_ONLINE_PAYMENT_TERMS.map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ul>
            <CheckField checked={accepted} onChange={setAccepted}>
              Leí estas condiciones y las acepto a nombre de la organización.
            </CheckField>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!accepted || busy} onClick={() => void save(true)}>
                Aceptar y encender
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAccepting(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {canManage ? (
          !accepting &&
          (settings.enabled ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(false)}>
              Apagar el pago en línea
            </Button>
          ) : (
            <Button size="sm" disabled={!settings.canCollect} onClick={() => setAccepting(true)}>
              Encender el pago en línea
            </Button>
          ))
        ) : (
          <p className="text-muted-foreground">
            Solo una persona con rol de administración puede encenderlo o apagarlo.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
