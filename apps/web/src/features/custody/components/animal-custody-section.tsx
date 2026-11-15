import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CUSTODY_ACCOUNT_STATUS_LABELS,
  CUSTODY_CONTRACT_STATUS_LABELS,
  CUSTODY_DEBT_SEPARATION_NOTICE,
  CUSTODY_DOCUMENT_KIND_LABELS,
  CUSTODY_EVENT_TYPE_LABELS,
  CUSTODY_INTAKE_REASON_LABELS,
  CUSTODY_STATUS_LABELS,
  Role,
  type CustodyCharge,
  type CustodyContract,
  type CustodyDocument,
  type CustodyDocumentKind,
  type CustodyEvent,
  type CustodyIntake,
  type CustodyOverview,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Timeline,
  friendlyErrorMessage,
  useToast,
} from '@adoptafacil/ui';
import { useSession } from '../../../shell/auth';
import { openBlob, useCustodyApi } from '../api/custody-api';
import {
  ACCOUNT_STATUS_TONE,
  ANIMAL_STATUS_LABELS,
  CONTRACT_STATUS_TONE,
  CUSTODY_STATUS_TONE,
  formatBytes,
  formatCop,
  formatInstant,
  missingDataOf,
} from '../model/custody-view';
import { ChargeDialog, ChargeList } from './account-panel';
import { ContractDialog, ContractList } from './contracts-panel';
import { Notice, SelectField } from './form-kit';
import { EventDialog, IntakeDialog, ReleaseDialog, UploadDialog } from './record-dialogs';

type SubTab = 'historial' | 'documentos' | 'contratos' | 'cuenta';
type Open =
  | { kind: 'intake'; editing?: CustodyIntake }
  | { kind: 'finalize'; intake: CustodyIntake }
  | { kind: 'release' }
  | { kind: 'event' }
  | { kind: 'upload'; presetKind?: CustodyDocumentKind; contractId?: string }
  | { kind: 'contract'; editing?: CustodyContract }
  | { kind: 'charge' }
  | null;

interface Data {
  overview: CustodyOverview;
  timeline: CustodyEvent[];
  documents: CustodyDocument[];
  contracts: CustodyContract[];
  charges: CustodyCharge[];
  intakes: CustodyIntake[];
}

function StatusTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/**
 * Pestaña "Documentación y custodia" del animal: sus cuatro estados (custodia,
 * contrato, cuenta y bienestar, cada uno por su lado), el historial
 * cronológico, los documentos, los contratos y la cuenta del responsable.
 */
export function AnimalCustodySection({
  animalId,
  animalName,
}: {
  animalId: string;
  animalName: string;
}) {
  const api = useCustodyApi();
  const { hasAnyRole, user } = useSession();
  const { toast } = useToast();
  const canWrite = hasAnyRole(Role.Owner, Role.Administrator, Role.Operator);
  const canManage = hasAnyRole(Role.Owner, Role.Administrator);

  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<SubTab>('historial');
  const [open, setOpen] = useState<Open>(null);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<CustodyDocumentKind | ''>('');
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [overview, timeline, documents, contracts, charges, intakes] = await Promise.all([
        api.overview(animalId),
        api.timeline(animalId),
        api.documents(animalId),
        api.contracts(animalId),
        api.charges({ animalId }),
        api.intakes(animalId),
      ]);
      setData({ overview, timeline, documents, contracts, charges, intakes });
      setLoadError(null);
    } catch (error) {
      setLoadError(friendlyErrorMessage(error));
    }
  }, [api, animalId]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const done = (message: string) => {
    setOpen(null);
    toast({ title: message, variant: 'success' });
    void load();
  };

  const openDocument = async (id: string) => {
    try {
      openBlob(await api.documentBlob(id));
    } catch (error) {
      toast({
        title: 'No pudimos abrir el documento',
        description: friendlyErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const generateReport = async () => {
    try {
      const doc = await api.individualReport(animalId);
      toast({ title: 'Reporte individual generado', variant: 'success' });
      void load();
      await openDocument(doc.id);
    } catch (error) {
      toast({
        title: 'No se pudo generar el reporte',
        description: friendlyErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const finalize = async (intake: CustodyIntake) => {
    setFinalizeBusy(true);
    setFinalizeError(null);
    try {
      const result = await api.finalizeIntake(intake.id);
      done('Acta de ingreso generada.');
      await openDocument(result.document.id);
    } catch (error) {
      const missing = missingDataOf(error);
      setFinalizeError(missing.length > 0 ? missing : [friendlyErrorMessage(error)]);
    } finally {
      setFinalizeBusy(false);
    }
  };

  const documents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.documents ?? []).filter(
      (doc) =>
        (!kindFilter || doc.kind === kindFilter) &&
        (!term ||
          doc.title.toLowerCase().includes(term) ||
          CUSTODY_DOCUMENT_KIND_LABELS[doc.kind].toLowerCase().includes(term)),
    );
  }, [data, search, kindFilter]);

  if (loadError) {
    return (
      <EmptyState
        title="No pudimos cargar la documentación"
        description={loadError}
        action={<Button onClick={() => void load()}>Reintentar</Button>}
      />
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const { overview } = data;
  const draftIntake = data.intakes.find((intake) => intake.status === 'draft');
  const responsible = overview.latestIntake?.responsible ?? overview.currentContract?.responsible;
  const userName = user?.name ?? '';
  const kindsPresent = [...new Set(data.documents.map((doc) => doc.kind))];

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatusTile label="Custodia">
          <Badge variant={CUSTODY_STATUS_TONE[overview.custodyStatus]}>
            {CUSTODY_STATUS_LABELS[overview.custodyStatus]}
          </Badge>
        </StatusTile>
        <StatusTile label="Contrato">
          <Badge variant={CONTRACT_STATUS_TONE[overview.contractStatus]}>
            {overview.contractStatus === 'none'
              ? 'Sin contrato'
              : CUSTODY_CONTRACT_STATUS_LABELS[overview.contractStatus]}
          </Badge>
        </StatusTile>
        <StatusTile label="Cuenta">
          <Badge variant={ACCOUNT_STATUS_TONE[overview.accountStatus]}>
            {CUSTODY_ACCOUNT_STATUS_LABELS[overview.accountStatus]}
          </Badge>
          {overview.pendingCop > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Pendiente {formatCop(overview.pendingCop)}
            </p>
          )}
        </StatusTile>
        <StatusTile label="Estado del animal">
          <Badge variant="secondary">
            {ANIMAL_STATUS_LABELS[overview.welfareStatus] ?? overview.welfareStatus}
          </Badge>
        </StatusTile>
      </div>

      {overview.overdueCop > 0 && (
        <Notice tone="warning">
          Hay {formatCop(overview.overdueCop)} vencidos en la cuenta.{' '}
          {CUSTODY_DEBT_SEPARATION_NOTICE}
        </Notice>
      )}

      {draftIntake && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3">
          <p className="text-sm">
            Hay un ingreso en borrador del {formatInstant(draftIntake.intakeAt)} (
            {CUSTODY_INTAKE_REASON_LABELS[draftIntake.reason]}). Genera el acta cuando esté
            completo.
          </p>
          {canWrite && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpen({ kind: 'intake', editing: draftIntake })}
              >
                Corregir
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setFinalizeError(null);
                  setOpen({ kind: 'finalize', intake: draftIntake });
                }}
              >
                Generar acta
              </Button>
            </div>
          )}
        </div>
      )}

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          {!draftIntake && overview.custodyStatus !== 'in_custody' && (
            <Button size="sm" onClick={() => setOpen({ kind: 'intake' })}>
              Registrar ingreso
            </Button>
          )}
          {overview.custodyStatus === 'in_custody' && (
            <Button size="sm" onClick={() => setOpen({ kind: 'release' })}>
              Registrar salida
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setOpen({ kind: 'contract' })}>
            Nuevo contrato
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen({ kind: 'charge' })}>
            Registrar cobro
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen({ kind: 'upload' })}>
            Adjuntar documento
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen({ kind: 'event' })}>
            Registrar novedad
          </Button>
          <Button size="sm" variant="outline" onClick={() => void generateReport()}>
            Reporte individual
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(value as SubTab)}>
        {/* En pantallas angostas las pestañas se desplazan en vez de desbordar la página. */}
        <div className="w-0 min-w-full overflow-x-auto">
          <TabsList aria-label="Documentación y custodia del animal">
            <TabsTrigger value="historial">Historial</TabsTrigger>
            <TabsTrigger value="documentos">Documentos ({data.documents.length})</TabsTrigger>
            <TabsTrigger value="contratos">Contratos ({data.contracts.length})</TabsTrigger>
            <TabsTrigger value="cuenta">Cuenta ({data.charges.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="historial">
          {data.timeline.length === 0 ? (
            <EmptyState
              title="Aún no hay historial"
              description="Registra el ingreso del animal para empezar su historial de custodia."
            />
          ) : (
            <Timeline
              events={data.timeline.map((event, index) => ({
                key: event.id,
                active: index === 0,
                label: (
                  <>
                    <span className="font-medium">{CUSTODY_EVENT_TYPE_LABELS[event.type]}</span>
                    {' · '}
                    {event.summary}
                    {event.isRetrospective && (
                      <Badge variant="outline" className="ml-2">
                        Retrospectivo
                      </Badge>
                    )}
                    {event.detail && (
                      <span className="mt-1 block whitespace-pre-line text-sm text-muted-foreground">
                        {event.detail}
                      </span>
                    )}
                    {event.documentId && (
                      <button
                        type="button"
                        className="mt-1 block text-sm underline underline-offset-4"
                        onClick={() => void openDocument(event.documentId as string)}
                      >
                        Ver documento
                      </button>
                    )}
                  </>
                ),
                meta: `${formatInstant(event.occurredAt)} · ${event.actorName}${
                  event.isRetrospective
                    ? ` · registrado el ${formatInstant(event.recordedAt)}${
                        event.retrospectiveSource ? ` · fuente: ${event.retrospectiveSource}` : ''
                      }`
                    : ''
                }`,
              }))}
            />
          )}
        </TabsContent>

        <TabsContent value="documentos">
          <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_260px]">
            <Input
              placeholder="Buscar por título o tipo"
              aria-label="Buscar documentos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <SelectField
              value={kindFilter}
              onChange={setKindFilter}
              placeholder="Todos los tipos"
              options={kindsPresent.map((kind) => ({
                value: kind,
                label: CUSTODY_DOCUMENT_KIND_LABELS[kind],
              }))}
            />
          </div>
          {documents.length === 0 ? (
            <EmptyState
              title="No hay documentos"
              description="Aquí quedan las actas, los contratos, las constancias y lo que adjuntes."
            />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{doc.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {CUSTODY_DOCUMENT_KIND_LABELS[doc.kind]} ·{' '}
                      {doc.source === 'generated' ? 'Generado por AdoptaFácil' : 'Adjuntado'}
                      {doc.version > 1 ? ` · versión ${doc.version}` : ''} ·{' '}
                      {formatInstant(doc.createdAt)} · {doc.createdByName} ·{' '}
                      {formatBytes(doc.sizeBytes)}
                      {doc.isRetrospective ? ' · retrospectivo' : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void openDocument(doc.id)}>
                    Ver o descargar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="contratos">
          <ContractList
            api={api}
            contracts={data.contracts}
            canWrite={canWrite}
            canManage={canManage}
            onChanged={() => void load()}
            onEdit={(contract) => setOpen({ kind: 'contract', editing: contract })}
            onAttachSigned={(contract) =>
              setOpen({ kind: 'upload', presetKind: 'signed_contract', contractId: contract.id })
            }
          />
        </TabsContent>

        <TabsContent value="cuenta">
          <ChargeList
            api={api}
            charges={data.charges}
            canWrite={canWrite}
            canManage={canManage}
            onChanged={() => void load()}
          />
        </TabsContent>
      </Tabs>

      <IntakeDialog
        api={api}
        animalId={animalId}
        animalName={animalName}
        open={open?.kind === 'intake'}
        editing={open?.kind === 'intake' ? open.editing : null}
        defaultReceivedBy={userName}
        onClose={() => setOpen(null)}
        onDone={done}
      />
      <ReleaseDialog
        api={api}
        animalId={animalId}
        animalName={animalName}
        open={open?.kind === 'release'}
        pendingCop={overview.pendingCop}
        canDecide={canManage}
        defaultDeliveredBy={userName}
        defaultReceivedBy={responsible?.fullName}
        onClose={() => setOpen(null)}
        onDone={done}
      />
      <EventDialog
        api={api}
        animalId={animalId}
        animalName={animalName}
        open={open?.kind === 'event'}
        onClose={() => setOpen(null)}
        onDone={done}
      />
      <UploadDialog
        api={api}
        animalId={animalId}
        animalName={animalName}
        open={open?.kind === 'upload'}
        contracts={data.contracts}
        presetKind={open?.kind === 'upload' ? open.presetKind : undefined}
        presetContractId={open?.kind === 'upload' ? open.contractId : undefined}
        onClose={() => setOpen(null)}
        onDone={done}
      />
      <ContractDialog
        api={api}
        animalId={animalId}
        animalName={animalName}
        open={open?.kind === 'contract'}
        editing={open?.kind === 'contract' ? open.editing : null}
        onClose={() => setOpen(null)}
        onDone={done}
      />
      <ChargeDialog
        api={api}
        animalId={animalId}
        animalName={animalName}
        open={open?.kind === 'charge'}
        defaultResponsibleId={responsible?.id}
        contractId={
          overview.currentContract && overview.currentContract.status !== 'cancelled'
            ? overview.currentContract.id
            : undefined
        }
        onClose={() => setOpen(null)}
        onDone={done}
      />

      <Dialog
        open={open?.kind === 'finalize'}
        onOpenChange={(next) => !next && !finalizeBusy && setOpen(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar el acta de ingreso y recepción</DialogTitle>
            <DialogDescription>
              El acta se genera con los datos del borrador. Después de generarla, el ingreso ya no
              se puede modificar: revisa antes que todo esté correcto.
            </DialogDescription>
          </DialogHeader>
          {finalizeError && (
            <ul
              role="alert"
              className="list-disc rounded-md bg-red-50 py-2 pl-8 pr-3 text-sm text-red-800"
            >
              {finalizeError.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)} disabled={finalizeBusy}>
              Seguir revisando
            </Button>
            <Button
              disabled={finalizeBusy}
              onClick={() => open?.kind === 'finalize' && void finalize(open.intake)}
            >
              {finalizeBusy ? 'Generando…' : 'Generar acta definitiva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
