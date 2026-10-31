import type { PublicLedgerPage } from '@adoptafacil/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
} from '@adoptafacil/ui';
import { LedgerEntryList } from '../../../ledger/components/ledger-entry-list';
import { LedgerSummary } from '../../../ledger/components/ledger-summary';
import { LEDGER_HOW_IT_WORKS } from '../../../ledger/components/public-ledger-dialog';

export interface PreviewLedgerDialogProps {
  ledger: PublicLedgerPage | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Ver libro completo" en la vista previa de una plantilla: el mismo diálogo
 * del portal, con los movimientos que trae la vista previa (sin consultar la
 * API, que no conoce el portal de ejemplo).
 */
export function PreviewLedgerDialog({ ledger, open, onOpenChange }: PreviewLedgerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        style={{ zIndex: 70 }}
        data-testid="preview-ledger-dialog"
      >
        <DialogHeader>
          <DialogTitle>Transparencia — libro público</DialogTitle>
          <DialogDescription>{LEDGER_HOW_IT_WORKS}</DialogDescription>
        </DialogHeader>
        {ledger && ledger.items.length > 0 ? (
          <div className="space-y-4">
            <LedgerSummary totals={ledger.totals} />
            <LedgerEntryList items={ledger.items} />
          </div>
        ) : (
          <EmptyState
            title="Aún no hay movimientos"
            description="Cuando la organización reciba donaciones o registre gastos, aparecerán aquí."
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
