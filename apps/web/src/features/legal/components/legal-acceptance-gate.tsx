import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { getLegalDocument, type LegalDocumentKey } from '@adoptafacil/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { acceptLegalDocuments, fetchLegalStatus } from '../api/legal-api';
import { type ConsentState, acceptancesFrom, requiredConsentsGiven } from '../model/consent';
import { LegalConsentFields } from './legal-consent-fields';

/**
 * Compuerta de aceptación legal para toda la zona autenticada. Si a la cuenta
 * le falta aceptar la versión vigente de un documento obligatorio (cuenta
 * creada con Google, o un documento que cambió de versión), muestra un diálogo
 * que no se puede cerrar hasta aceptar. El servidor registra la aceptación con
 * versión, hash, fecha, IP y navegador, y envía la constancia por correo.
 *
 * Si `/legal/me` no responde, deja pasar: la aceptación del registro ya quedó
 * en el servidor y una caída de red no debe bloquear la cuenta.
 */
export function LegalAcceptanceGate() {
  const client = useApiClient();
  const { user } = useSession();
  const { toast } = useToast();
  const [pending, setPending] = useState<LegalDocumentKey[]>([]);
  const [consents, setConsents] = useState<ConsentState>({});
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchLegalStatus(client)
      .then((status) => {
        if (active) setPending(Array.isArray(status?.pending) ? status.pending : []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, user?.id]);

  const audience = user?.accountType === 'organization' ? 'organization' : 'person';

  const accept = useCallback(async () => {
    if (!requiredConsentsGiven(audience, consents)) {
      setError('Marca las casillas obligatorias para continuar.');
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const status = await acceptLegalDocuments(client, {
        documents: acceptancesFrom(audience, consents),
      });
      setPending(status.pending);
      toast({
        title: 'Registramos tu aceptación',
        description: `Versión ${getLegalDocument('terms').version}. Te enviamos una constancia a tu correo.`,
      });
    } catch {
      setError('No pudimos registrar tu aceptación. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }, [audience, client, consents, toast]);

  return (
    <>
      <Outlet />
      {pending.length > 0 && (
        <Dialog open onOpenChange={() => undefined}>
          <DialogContent
            hideCloseButton
            onEscapeKeyDown={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Antes de continuar</DialogTitle>
              <DialogDescription>
                Para usar tu cuenta necesitamos que aceptes la versión vigente de estos documentos.
                Puedes leerlos completos en los enlaces.
              </DialogDescription>
            </DialogHeader>
            <LegalConsentFields
              audience={audience}
              value={consents}
              onChange={setConsents}
              error={error}
              idPrefix="gate"
            />
            <Button onClick={() => void accept()} disabled={saving}>
              {saving ? 'Guardando…' : 'Aceptar y continuar'}
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
