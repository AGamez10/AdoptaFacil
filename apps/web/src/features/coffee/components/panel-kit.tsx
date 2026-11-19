import { useCallback, useState, type ReactNode } from 'react';
import { useToast } from '@adoptafacil/ui';

/** Piezas comunes de los formularios del panel del café. */

export const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Inténtalo de nuevo.';
}

/** Hook mínimo: una acción con aviso de éxito o error y recarga. */
export function useAction(reload: () => Promise<void>) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn: () => Promise<unknown>, ok: string) => {
      setBusy(true);
      try {
        await fn();
        toast({ title: ok });
        await reload();
        return true;
      } catch (error) {
        toast({ title: 'No se pudo', description: errorText(error), variant: 'destructive' });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload, toast],
  );
  return { busy, run };
}
