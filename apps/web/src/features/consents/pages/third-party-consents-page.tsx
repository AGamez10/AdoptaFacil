import { useCallback, useEffect, useState } from 'react';
import {
  type GrantThirdPartyConsentInput,
  type RevokeThirdPartyConsentInput,
  type ThirdPartyConsentItem,
  type ThirdPartyConsentStatus,
  type ThirdPartyConsentText,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';

/**
 * `/uso-de-mis-datos` (M13) — "Uso de mis datos en reportes". Una persona
 * (donante o voluntaria) decide, organización por organización, si su nombre y
 * su documento (parcialmente oculto) pueden aparecer en los reportes y
 * certificados que esa organización emite. Nada viene marcado; se autoriza con
 * un acto explícito y se puede revocar cuando se quiera. Solo aparecen las
 * organizaciones con las que la persona tiene una relación real.
 */
export function ThirdPartyConsentsPage() {
  const client = useApiClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<ThirdPartyConsentStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await client.request<ThirdPartyConsentStatus>('/me/consents'));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(item: ThirdPartyConsentItem, text: ThirdPartyConsentText, grant: boolean) {
    setBusy(item.organizationId);
    try {
      const next = grant
        ? await client.request<ThirdPartyConsentStatus>('/me/consents', {
            method: 'POST',
            json: {
              organizationId: item.organizationId,
              purpose: item.purpose,
              version: text.version,
            } satisfies GrantThirdPartyConsentInput,
          })
        : await client.request<ThirdPartyConsentStatus>('/me/consents/revoke', {
            method: 'POST',
            json: {
              organizationId: item.organizationId,
              purpose: item.purpose,
            } satisfies RevokeThirdPartyConsentInput,
          });
      setStatus(next);
      toast({
        title: grant ? 'Autorización registrada' : 'Autorización retirada',
        description: grant
          ? `${item.organizationName} podrá identificarte en los documentos que emita desde ahora.`
          : `${item.organizationName} dejará de identificarte en los documentos nuevos.`,
      });
    } catch (error) {
      toast({
        title: 'No se pudo guardar el cambio',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Uso de mis datos en reportes"
        description="Las organizaciones con las que has donado o hecho voluntariado emiten reportes y certificados. Tú decides si en ellos aparecen tu nombre y tu documento."
      />

      {failed && (
        <p role="alert" className="text-sm text-destructive">
          No pudimos cargar tus autorizaciones. Recarga la página para intentarlo de nuevo.
        </p>
      )}
      {!status && !failed && <Skeleton className="h-32 w-full" />}

      {status && status.items.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Todavía no tienes relación con ninguna organización (donaciones con tu cuenta o
            voluntariado). Cuando la tengas, aparecerá aquí.
          </CardContent>
        </Card>
      )}

      {status?.items.map((item) => {
        const text = status.texts.find((t) => t.purpose === item.purpose);
        if (!text) return null;
        return (
          <Card key={`${item.organizationId}:${item.purpose}`}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">{item.organizationName}</CardTitle>
                <Badge variant={item.authorized ? 'default' : 'secondary'}>
                  {item.authorized ? 'Autorizado' : 'Sin autorización'}
                </Badge>
              </div>
              <CardDescription>{text.title}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm">{text.text}</p>
              {text.draft && (
                <p className="text-xs text-muted-foreground">
                  Texto en borrador, sujeto a revisión legal.
                </p>
              )}
              {item.authorized && item.grantedAt && (
                <p className="text-xs text-muted-foreground">
                  Autorizado el{' '}
                  {new Date(item.grantedAt).toLocaleString('es-CO', {
                    timeZone: 'America/Bogota',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}{' '}
                  (versión {item.textVersion}).
                </p>
              )}
              <div>
                {item.authorized ? (
                  <Button
                    variant="outline"
                    disabled={busy === item.organizationId}
                    onClick={() => void change(item, text, false)}
                  >
                    Retirar mi autorización
                  </Button>
                ) : (
                  <Button
                    disabled={busy === item.organizationId}
                    onClick={() => void change(item, text, true)}
                  >
                    Autorizo a {item.organizationName}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </PageContainer>
  );
}
