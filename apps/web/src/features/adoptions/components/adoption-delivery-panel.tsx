import { useCallback, useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import {
  ADOPTION_DELIVERY_ITEMS,
  type AdoptionDelivery,
  type AdoptionDeliveryCodeIssued,
  type AdoptionDeliveryItem,
} from '@adoptafacil/contracts';
import { Button, Input, Skeleton, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import {
  cancelAdoptionDelivery,
  createDeliveryPhotoTarget,
  getDeliveryForContract,
  regenerateDeliveryCode,
  startAdoptionDelivery,
  uploadDeliveryPhoto,
} from '../api/adoptions-api';
import { formatBogota } from '../model/adoptions-view';
import { DELIVERY_ITEM_LABELS, minutesLeft } from '../model/adoptions-delivery-view';

const PHOTO_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_MB = 15;

export interface AdoptionDeliveryPanelProps {
  contractId: string;
  animalName: string;
}

/** QR del enlace de confirmación, generado en el navegador. */
function DeliveryQr({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: 220, margin: 1 })
      .then((url) => active && setDataUrl(url))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [value]);
  if (!dataUrl)
    return <div aria-hidden className="h-[220px] w-[220px] animate-pulse rounded bg-muted" />;
  return <img src={dataUrl} width={220} height={220} alt="Código QR para confirmar la entrega" />;
}

/**
 * "Entregar" (ajuste 6): con el contrato firmado, la persona de la organización
 * registra la entrega desde el celular (salud, peso, identidad, lo entregado y
 * una foto obligatoria) y muestra un QR con un código de 6 dígitos que el
 * adoptante confirma en su sesión. Al confirmar, el animal pasa a adoptado y
 * se programan los seguimientos del plan.
 */
export function AdoptionDeliveryPanel({ contractId, animalName }: AdoptionDeliveryPanelProps) {
  const client = useApiClient();
  const { toast } = useToast();

  const [delivery, setDelivery] = useState<AdoptionDelivery | null | undefined>(undefined);
  const [issued, setIssued] = useState<AdoptionDeliveryCodeIssued | null>(null);
  const [busy, setBusy] = useState(false);

  const [healthStatus, setHealthStatus] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [identityVerified, setIdentityVerified] = useState(false);
  const [identificationChecked, setIdentificationChecked] = useState(false);
  const [items, setItems] = useState<AdoptionDeliveryItem[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    getDeliveryForContract(client, contractId)
      .then(setDelivery)
      .catch(() => setDelivery(null));
  }, [client, contractId]);

  useEffect(() => load(), [load]);

  const onIssued = (result: AdoptionDeliveryCodeIssued) => {
    setIssued(result);
    setDelivery(result.delivery);
  };

  const toggleItem = (item: AdoptionDeliveryItem) =>
    setItems((current) =>
      current.includes(item) ? current.filter((i) => i !== item) : [...current, item],
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const weight = Number(weightKg.replace(',', '.'));
    if (healthStatus.trim().length < 3) return setFormError('Describe el estado de salud.');
    if (!Number.isFinite(weight) || weight <= 0) return setFormError('Indica el peso en kg.');
    if (!identityVerified)
      return setFormError('Confirma la identidad del adoptante con su documento original.');
    if (!photo) return setFormError(`Toma la foto de ${animalName} con su nuevo hogar.`);
    if (!PHOTO_ACCEPT.includes(photo.type))
      return setFormError('La foto debe ser JPG, PNG o WEBP.');
    if (photo.size > PHOTO_MAX_MB * 1024 * 1024)
      return setFormError(`La foto supera ${PHOTO_MAX_MB} MB.`);

    setBusy(true);
    try {
      const target = await createDeliveryPhotoTarget(client, photo.name);
      await uploadDeliveryPhoto(client, target.storageRef, photo);
      onIssued(
        await startAdoptionDelivery(client, {
          contractId,
          healthStatus: healthStatus.trim(),
          weightKg: weight,
          identityVerified,
          identificationChecked,
          items,
          photoRef: target.storageRef,
        }),
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo registrar la entrega.');
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (!delivery) return;
    setBusy(true);
    try {
      onIssued(await regenerateDeliveryCode(client, delivery.id));
    } catch {
      toast({ title: 'No se pudo generar un código nuevo', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!delivery) return;
    setBusy(true);
    try {
      await cancelAdoptionDelivery(client, delivery.id);
      setIssued(null);
      setDelivery(null);
      toast({ title: 'Entrega cancelada' });
    } catch {
      toast({ title: 'No se pudo cancelar la entrega', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (delivery === undefined) return <Skeleton className="h-24 w-full" />;

  if (delivery?.status === 'confirmed') {
    return (
      <section className="space-y-2 rounded-md border p-4">
        <h3 className="font-semibold">Entrega confirmada</h3>
        <p className="text-sm">
          {animalName} fue entregado y el adoptante lo confirmó el{' '}
          {formatBogota(delivery.confirmedAt ?? delivery.createdAt)}. Ya está marcado como adoptado
          y sus seguimientos quedaron programados.
        </p>
        <p className="break-all text-xs text-muted-foreground">
          Huella SHA-256 del acta: {delivery.contentHash}
        </p>
      </section>
    );
  }

  if (delivery?.status === 'pending_confirmation') {
    const code = issued?.delivery.id === delivery.id ? issued : null;
    return (
      <section className="space-y-3 rounded-md border p-4">
        <h3 className="font-semibold">Esperando la confirmación del adoptante</h3>
        {code ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <DeliveryQr value={code.confirmUrl} />
            <p className="text-sm">
              Pide al adoptante que escanee el código con su sesión abierta.
            </p>
            <p className="text-sm">
              Si no tiene el celular a mano, le llegó este código por correo:
            </p>
            <p className="font-mono text-3xl tracking-[0.3em]" aria-label="Código de confirmación">
              {code.code}
            </p>
            <p className="text-xs text-muted-foreground">
              Vence en {minutesLeft(code.delivery.codeExpiresAt)} minutos.
            </p>
          </div>
        ) : (
          <p className="text-sm">
            Hay una entrega registrada sin confirmar. Genera un código nuevo para mostrarle el QR al
            adoptante.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void regenerate()}>
            {code ? 'Generar otro código' : 'Generar código'}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void cancel()}>
            Cancelar la entrega
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-md border p-4">
      <h3 className="font-semibold">Entregar a {animalName}</h3>
      <p className="text-sm text-muted-foreground">
        Llena esto en el momento de la entrega. Al final se muestra un código QR para que el
        adoptante confirme que recibió a {animalName}.
      </p>
      <form className="space-y-3" onSubmit={(e) => void submit(e)} noValidate>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Estado de salud al entregar</span>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            rows={3}
            value={healthStatus}
            onChange={(e) => setHealthStatus(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Peso (kg)</span>
          <Input
            inputMode="decimal"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={identityVerified}
            onChange={(e) => setIdentityVerified(e.target.checked)}
          />
          <span>
            Verifiqué la identidad del adoptante con su documento original (sin guardar copia).
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={identificationChecked}
            onChange={(e) => setIdentificationChecked(e.target.checked)}
          />
          <span>Verifiqué el microchip o la placa contra el contrato.</span>
        </label>
        <fieldset className="space-y-1 text-sm">
          <legend className="font-medium">Lo que se entrega</legend>
          {ADOPTION_DELIVERY_ITEMS.map((item) => (
            <label key={item} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={items.includes(item)}
                onChange={() => toggleItem(item)}
              />
              <span>{DELIVERY_ITEM_LABELS[item]}</span>
            </label>
          ))}
        </fieldset>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Foto de {animalName} con su nuevo hogar (obligatoria)</span>
          <input
            type="file"
            accept={PHOTO_ACCEPT.join(',')}
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Registrando…' : 'Registrar la entrega y mostrar el QR'}
        </Button>
      </form>
    </section>
  );
}
