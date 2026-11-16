import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';

/** Debe coincidir con `SUPPRESSION_CONFIRMATION` de la API. */
export const SUPPRESSION_PHRASE = 'SUPRIMIR MI CUENTA';

interface RetainedItem {
  data: string;
  reason: string;
}

/**
 * Derechos del titular (Ley 1581, arts. 14 y 15): descargar todo lo que
 * AdoptaFácil guarda de la persona y suprimir su cuenta. La supresión es
 * irreversible; se confirma escribiendo una frase y al terminar se cierra la
 * sesión. Lo que la ley obliga a conservar se explica en la respuesta.
 */
export function PrivacyRightsCard() {
  const client = useApiClient();
  const { toast } = useToast();
  const { user, signOut } = useSession();
  const [busy, setBusy] = useState<null | 'export' | 'suppress'>(null);
  const [phrase, setPhrase] = useState('');
  const [retained, setRetained] = useState<RetainedItem[] | null>(null);
  const isPerson = user?.accountType === 'person';

  async function download() {
    setBusy('export');
    try {
      const data = await client.request<unknown>('/me/privacy/data');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mis-datos-adoptafacil.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'No pudimos preparar tus datos. Intenta de nuevo.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function suppress() {
    setBusy('suppress');
    try {
      const result = await client.request<{ retained: RetainedItem[] }>('/me/privacy/suppression', {
        method: 'POST',
        json: { confirmation: phrase },
      });
      setRetained(result.retained);
      toast({ title: 'Tu cuenta fue suprimida.', variant: 'success' });
      await signOut();
    } catch {
      toast({ title: 'No pudimos suprimir tu cuenta. Intenta de nuevo.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Tus derechos sobre tus datos</CardTitle>
        <CardDescription>
          Puedes consultar todo lo que AdoptaFácil guarda de ti y, si eres una persona, suprimir tu
          cuenta (Ley 1581 de 2012).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Button variant="outline" disabled={busy !== null} onClick={() => void download()}>
            Descargar mis datos
          </Button>
        </div>
        {isPerson && !retained && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3">
            <p className="text-sm">
              Suprimir tu cuenta borra tus publicaciones y mascotas y quita tu nombre, correo,
              teléfono, documento y dirección. No se puede deshacer. Se conservan, porque la ley lo
              exige, tus donaciones, adopciones, apadrinamientos y compras.
            </p>
            <label htmlFor="privacy-confirm" className="text-sm font-medium">
              Escribe {SUPPRESSION_PHRASE} para confirmar
            </label>
            <Input
              id="privacy-confirm"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
            />
            <div>
              <Button
                disabled={busy !== null || phrase.trim().toUpperCase() !== SUPPRESSION_PHRASE}
                onClick={() => void suppress()}
              >
                Suprimir mi cuenta
              </Button>
            </div>
          </div>
        )}
        {retained && (
          <ul className="list-disc pl-5 text-sm">
            {retained.map((r) => (
              <li key={r.data}>
                <strong>{r.data}:</strong> {r.reason}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
