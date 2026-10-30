import { useEffect, useState } from 'react';
import {
  buildOrganizationQrUrl,
  qrTargetNeedsId,
  type OrganizationQr,
  type QrTarget,
  type QrTargetKind,
} from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useFeature } from '../../../shell/capabilities';
import { getOwnOrganizationQr, updateOrganizationQrTarget } from '../api/org-qr-panel';
import { QrSharePanel } from './qr-share-panel';

export interface OrgQrCardProps {
  organizationName?: string;
  /** La org ya guardó el enlace de su portal (slug). Sin él el QR no abre nada. */
  hasPortalLink: boolean;
  /** Lleva al campo donde se define el enlace del portal. */
  onConfigureLink?: () => void;
}

const KIND_LABELS: Record<QrTargetKind, string> = {
  profile: 'El perfil de la organización',
  donate: 'Donar a la organización',
  campaign: 'Una campaña',
  animal: 'Apadrinar un animal',
};

function describeTarget(qr: OrganizationQr, target: QrTarget): string {
  if (target.kind === 'campaign') {
    const found = qr.campaigns.find((c) => c.id === target.id);
    return found ? `la campaña «${found.label}»` : 'una campaña';
  }
  if (target.kind === 'animal') {
    const found = qr.animals.find((a) => a.id === target.id);
    return found ? `apadrinar a ${found.label}` : 'apadrinar un animal';
  }
  return target.kind === 'profile' ? 'el perfil de la organización' : 'donar a la organización';
}

/**
 * QR FIJO de la organización: una sola etiqueta que se imprime o se muestra en
 * videos y nunca cambia (`/q/<código>`). Aquí se elige a dónde lleva: perfil,
 * donar, una campaña activa o apadrinar un animal con plan. Cambiar el destino
 * no obliga a reimprimir.
 */
export function OrgQrCard({ organizationName, hasPortalLink, onConfigureLink }: OrgQrCardProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const payments = useFeature('payments');
  const sponsorships = useFeature('sponsorships');
  const [qr, setQr] = useState<OrganizationQr | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [kind, setKind] = useState<QrTargetKind>('profile');
  const [targetId, setTargetId] = useState('');
  const [saving, setSaving] = useState(false);

  const apply = (next: OrganizationQr) => {
    setQr(next);
    setKind(next.target.kind);
    setTargetId(next.target.id ?? '');
  };

  useEffect(() => {
    let active = true;
    getOwnOrganizationQr(client)
      .then((next) => {
        if (active) apply(next);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [client]);

  const url = qr ? buildOrganizationQrUrl(qr.code, window.location.origin) : null;
  // Donar y apadrinar solo se ofrecen con su módulo encendido; un destino ya
  // guardado se sigue mostrando para no esconder lo que está activo.
  const kinds = (['profile', 'donate', 'campaign', 'animal'] as const).filter(
    (k) =>
      qr?.target.kind === k || ((k !== 'donate' || payments) && (k !== 'animal' || sponsorships)),
  );
  const options = kind === 'campaign' ? (qr?.campaigns ?? []) : (qr?.animals ?? []);
  const needsId = qrTargetNeedsId(kind);
  const unchanged =
    !!qr && qr.target.kind === kind && (qr.target.id ?? '') === (needsId ? targetId : '');
  const canSave = !!qr && !saving && !unchanged && (!needsId || targetId !== '');

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      apply(
        await updateOrganizationQrTarget(client, {
          kind,
          ...(needsId ? { id: targetId } : {}),
        }),
      );
      toast({
        title: 'Destino del QR actualizado',
        description: 'El mismo código ya lleva al nuevo destino. No tienes que reimprimirlo.',
      });
    } catch {
      toast({
        title: 'No se pudo cambiar el destino',
        description: 'Solo la persona propietaria o un administrador pueden cambiarlo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="org-qr-card">
      <CardHeader>
        <CardTitle>Código QR de tu organización</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!hasPortalLink ? (
          <div className="flex flex-col items-start gap-3" data-testid="org-qr-needs-link">
            <p className="text-sm text-muted-foreground">
              Para usar tu código QR, primero define el enlace de tu portal en los datos
              institucionales de la organización.
            </p>
            {onConfigureLink && (
              <Button variant="outline" size="sm" onClick={onConfigureLink}>
                Definir el enlace del portal
              </Button>
            )}
          </div>
        ) : loadError ? (
          <p className="text-sm text-muted-foreground">
            No pudimos cargar tu código QR. Recarga la página para intentarlo de nuevo.
          </p>
        ) : !qr || !url ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <QrSharePanel
              url={url}
              fileName={`qr-${qr.code}`}
              alt={`Código QR${organizationName ? ` de ${organizationName}` : ''}: ${url}`}
            >
              <p className="text-sm text-muted-foreground">
                Este código no cambia nunca: imprímelo en afiches, volantes o alcancías, o muéstralo
                en tus videos. Hoy lleva a{' '}
                <strong className="text-foreground" data-testid="org-qr-effective">
                  {describeTarget(qr, qr.effectiveTarget)}
                </strong>
                .
              </p>
              {qr.effectiveTarget.kind !== qr.target.kind && (
                <p className="text-sm text-muted-foreground" data-testid="org-qr-fallback">
                  El destino que elegiste ya no está disponible (la campaña terminó o el animal ya
                  no tiene plan), así que el código lleva a donar a tu organización.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Escaneos en los últimos 30 días: {qr.scansLast30Days}
              </p>
            </QrSharePanel>

            <fieldset className="flex flex-col gap-3 border-t pt-4">
              <legend className="text-sm font-semibold">¿A dónde lleva el código?</legend>
              {kinds.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="org-qr-kind"
                    value={k}
                    checked={kind === k}
                    onChange={() => {
                      setKind(k);
                      setTargetId(qr.target.kind === k ? (qr.target.id ?? '') : '');
                    }}
                  />
                  {KIND_LABELS[k]}
                </label>
              ))}
              {needsId && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="org-qr-target" className="text-sm">
                    {kind === 'campaign' ? 'Campaña activa' : 'Animal con plan de apadrinamiento'}
                  </label>
                  {options.length === 0 ? (
                    <p className="text-sm text-muted-foreground" data-testid="org-qr-no-options">
                      {kind === 'campaign'
                        ? 'No tienes campañas activas todavía.'
                        : 'Ningún animal disponible tiene un plan de apadrinamiento activo.'}
                    </p>
                  ) : (
                    <select
                      id="org-qr-target"
                      value={targetId}
                      onChange={(event) => setTargetId(event.target.value)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Elige una opción</option>
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <div>
                <Button size="sm" onClick={save} disabled={!canSave}>
                  {saving ? 'Guardando…' : 'Guardar destino'}
                </Button>
              </div>
            </fieldset>
          </>
        )}
      </CardContent>
    </Card>
  );
}
