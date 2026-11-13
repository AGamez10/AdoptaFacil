import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CUSTODY_BASE_TEMPLATE_KEY,
  CUSTODY_DEBT_SEPARATION_NOTICE,
  CUSTODY_TEMPLATE_VARIABLES,
  Role,
  type CustodyAccountSummary,
  type CustodyCharge,
  type CustodyClause,
  type CustodyContract,
  type CustodyContractTemplate,
  type CustodyResponsible,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  friendlyErrorMessage,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useSession } from '../../../shell/auth';
import { openBlob, useCustodyApi, type CustodyApi } from '../api/custody-api';
import { ChargeList } from '../components/account-panel';
import { ContractList } from '../components/contracts-panel';
import {
  CheckField,
  Field,
  FormDialog,
  Notice,
  ResponsibleDialog,
  SelectField,
  TextArea,
} from '../components/form-kit';
import { formatCop, formatDate, formatInstant } from '../model/custody-view';

type ChargeFilter = 'open' | 'late' | 'all';

function newClauseId(): string {
  return `clausula-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Editor de una plantilla: guardar siempre crea una versión nueva. */
function TemplateDialog({
  api,
  open,
  onClose,
  onDone,
  source,
  mode,
}: {
  api: CustodyApi;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  source: CustodyContractTemplate | null;
  /** `copy`: plantilla nueva a partir de otra. `edit`: versión siguiente. */
  mode: 'copy' | 'edit';
}) {
  const [name, setName] = useState('');
  const [clauses, setClauses] = useState<CustodyClause[]>([]);
  const [annexes, setAnnexes] = useState('');

  useEffect(() => {
    if (!open || !source) return;
    setName(mode === 'copy' ? `${source.name.replace(/\s*\(base\)$/i, '')} (propia)` : source.name);
    setClauses(source.clauses.map((clause) => ({ ...clause })));
    setAnnexes(source.annexes.join('\n'));
  }, [open, source, mode]);

  const patch = (index: number, change: Partial<CustodyClause>) =>
    setClauses((list) =>
      list.map((clause, i) => (i === index ? { ...clause, ...change } : clause)),
    );
  const move = (index: number, delta: number) =>
    setClauses((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      wide
      title={
        mode === 'copy'
          ? 'Nueva plantilla de contrato'
          : `Editar la plantilla (versión ${(source?.version ?? 0) + 1})`
      }
      description="Los contratos ya emitidos conservan la versión con la que se emitieron: este cambio solo aplica a los contratos nuevos."
      submitLabel={mode === 'copy' ? 'Crear plantilla' : 'Guardar versión nueva'}
      validate={() => {
        if (name.trim().length < 2) return 'Escribe el nombre de la plantilla.';
        const bad = clauses.find(
          (c) => !c.locked && (c.title.trim().length < 2 || c.body.trim().length < 10),
        );
        if (bad) return 'Cada cláusula necesita un título y un texto.';
        return null;
      }}
      onSubmit={async () => {
        if (!source) return;
        const input = {
          name: name.trim(),
          clauses: clauses.map((c) => ({ ...c, title: c.title.trim(), body: c.body.trim() })),
          annexes: annexes
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length >= 3),
        };
        if (mode === 'copy') await api.createTemplate(input);
        else await api.updateTemplate(source.templateKey, input);
        onDone(
          mode === 'copy' ? 'Plantilla creada.' : 'Se guardó una versión nueva de la plantilla.',
        );
      }}
    >
      <Field label="Nombre de la plantilla">
        <Input value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Notice>
        Variables disponibles (se reemplazan al emitir):{' '}
        {CUSTODY_TEMPLATE_VARIABLES.map((v) => `{{${v.key}}}`).join(', ')}. El texto es una base
        operativa: revísalo con tu asesor jurídico.
      </Notice>
      <ol className="space-y-3">
        {clauses.map((clause, index) => (
          <li key={clause.id} className="space-y-2 rounded-lg border border-border p-3">
            {clause.locked ? (
              <>
                <p className="text-sm font-medium">
                  {clause.title} <Badge variant="outline">Siempre incluida</Badge>
                </p>
                <p className="text-sm text-muted-foreground">{clause.body}</p>
                <p className="text-xs text-muted-foreground">
                  Esta cláusula no se puede quitar ni editar: protege al animal de quedar como
                  garantía de una deuda.
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-0 flex-1"
                    aria-label={`Título de la cláusula ${index + 1}`}
                    value={clause.title}
                    maxLength={120}
                    onChange={(e) => patch(index, { title: e.target.value })}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Subir cláusula"
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Bajar cláusula"
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setClauses((list) => list.filter((_, i) => i !== index))}
                  >
                    Quitar
                  </Button>
                </div>
                <TextArea
                  value={clause.body}
                  onChange={(body) => patch(index, { body })}
                  rows={4}
                  maxLength={4000}
                />
                <CheckField
                  checked={clause.enabled}
                  onChange={(enabled) => patch(index, { enabled })}
                >
                  Incluir en los contratos nuevos
                </CheckField>
              </>
            )}
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setClauses((list) => [...list, { id: newClauseId(), title: '', body: '', enabled: true }])
        }
      >
        Agregar cláusula
      </Button>
      <Field label="Anexos (uno por línea)">
        <TextArea value={annexes} onChange={setAnnexes} rows={3} />
      </Field>
    </FormDialog>
  );
}

/**
 * `/organizacion/custodia` — vencimientos y pagos, contratos, plantillas y
 * responsables de toda la organización. El detalle de cada animal vive en su
 * pestaña "Documentación y custodia".
 */
export function OrgCustodyPage() {
  const api = useCustodyApi();
  const { hasAnyRole } = useSession();
  const { toast } = useToast();
  const canWrite = hasAnyRole(Role.Owner, Role.Administrator, Role.Operator);
  const canManage = hasAnyRole(Role.Owner, Role.Administrator);

  const [summary, setSummary] = useState<CustodyAccountSummary | null>(null);
  const [charges, setCharges] = useState<CustodyCharge[]>([]);
  const [contracts, setContracts] = useState<CustodyContract[]>([]);
  const [templates, setTemplates] = useState<CustodyContractTemplate[]>([]);
  const [responsibles, setResponsibles] = useState<CustodyResponsible[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ChargeFilter>('open');
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [template, setTemplate] = useState<{
    source: CustodyContractTemplate;
    mode: 'copy' | 'edit';
  } | null>(null);
  const [versions, setVersions] = useState<CustodyContractTemplate[] | null>(null);
  const [responsible, setResponsible] = useState<{ editing: CustodyResponsible | null } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const [s, c, k, t, r] = await Promise.all([
        api.summary(),
        api.charges(),
        api.contracts(),
        api.templates(),
        api.responsibles(),
      ]);
      setSummary(s);
      setCharges(c);
      setContracts(k);
      setTemplates(t);
      setResponsibles(r);
      setLoadError(null);
    } catch (error) {
      setLoadError(friendlyErrorMessage(error));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const shownCharges = useMemo(
    () =>
      charges.filter((charge) => {
        if (responsibleFilter && charge.responsibleId !== responsibleFilter) return false;
        if (filter === 'all') return true;
        if (charge.status !== 'pending') return false;
        return (
          filter === 'open' ||
          charge.situation === 'overdue' ||
          charge.situation === 'extension_breached'
        );
      }),
    [charges, filter, responsibleFilter],
  );

  const shownResponsibles = useMemo(() => {
    const term = search.trim().toLowerCase();
    return responsibles.filter(
      (r) => !term || r.fullName.toLowerCase().includes(term) || r.documentNumber.includes(term),
    );
  }, [responsibles, search]);

  const done = (message: string) => {
    setTemplate(null);
    setResponsible(null);
    toast({ title: message, variant: 'success' });
    void load();
  };

  const fail = (title: string, error: unknown) =>
    toast({ title, description: friendlyErrorMessage(error), variant: 'destructive' });

  const statement = async (id: string) => {
    try {
      openBlob(await api.statementBlob(id));
    } catch (error) {
      fail('No pudimos generar el estado de cuenta', error);
    }
  };

  const archive = async (key: string) => {
    try {
      await api.archiveTemplate(key);
      done('Plantilla archivada. Ya no se ofrece para contratos nuevos.');
    } catch (error) {
      fail('No se pudo archivar', error);
    }
  };

  const showVersions = async (key: string) => {
    try {
      setVersions(await api.templateVersions(key));
    } catch (error) {
      fail('No pudimos cargar las versiones', error);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Custodia y guardería"
        description="Vencimientos, pagos, contratos y plantillas de toda la organización. El ingreso, la salida y los documentos de cada animal están en su ficha, en la pestaña Custodia."
      />

      {loadError ? (
        <EmptyState
          title="No pudimos cargar la información"
          description={loadError}
          action={<Button onClick={() => void load()}>Reintentar</Button>}
        />
      ) : !summary ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Tabs defaultValue="cuenta">
          {/* En pantallas angostas las pestañas se desplazan en vez de desbordar la página. */}
          <div className="w-0 min-w-full overflow-x-auto">
            <TabsList aria-label="Secciones de custodia y guardería">
              <TabsTrigger value="cuenta">Vencimientos y pagos</TabsTrigger>
              <TabsTrigger value="contratos">Contratos ({contracts.length})</TabsTrigger>
              <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
              <TabsTrigger value="responsables">Responsables ({responsibles.length})</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="cuenta">
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Por cobrar" value={formatCop(summary.pendingCop)} />
                <StatCard label="Vencido" value={formatCop(summary.overdueCop)} />
                <StatCard label="Recibido" value={formatCop(summary.paidCop)} />
              </div>

              {summary.alerts.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Vencimientos sin pago ({summary.alerts.length})</CardTitle>
                    <CardDescription>
                      Son avisos para que una persona revise cada caso.{' '}
                      {CUSTODY_DEBT_SEPARATION_NOTICE}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-border">
                      {summary.alerts.map((alert) => (
                        <li
                          key={alert.key}
                          className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                        >
                          <span>
                            <Badge variant="warning">
                              {alert.kind === 'extension_breached'
                                ? 'Prórroga incumplida'
                                : 'Vencido'}
                            </Badge>{' '}
                            {alert.responsibleName} · {alert.animalName} · {alert.description}
                          </span>
                          <span className="text-muted-foreground">
                            {formatCop(alert.balanceCop)} · venció el{' '}
                            {formatDate(alert.effectiveDueDate)} ({alert.daysOverdue} días)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Pendiente por responsable</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {summary.byResponsible.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin cobros registrados.</p>
                    ) : (
                      <ul className="divide-y divide-border text-sm">
                        {summary.byResponsible.map((line) => (
                          <li
                            key={line.id}
                            className="flex flex-wrap items-center justify-between gap-2 py-2"
                          >
                            <span>{line.name}</span>
                            <span className="flex items-center gap-3">
                              <span>
                                {formatCop(line.pendingCop)}
                                {line.overdueCop > 0
                                  ? ` · vencido ${formatCop(line.overdueCop)}`
                                  : ''}
                              </span>
                              <button
                                type="button"
                                className="underline underline-offset-4"
                                onClick={() => void statement(line.id)}
                              >
                                Estado de cuenta
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Pendiente por animal</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {summary.byAnimal.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin cobros registrados.</p>
                    ) : (
                      <ul className="divide-y divide-border text-sm">
                        {summary.byAnimal.map((line) => (
                          <li
                            key={line.id}
                            className="flex items-center justify-between gap-2 py-2"
                          >
                            <span>{line.name}</span>
                            <span>
                              {formatCop(line.pendingCop)}
                              {line.overdueCop > 0
                                ? ` · vencido ${formatCop(line.overdueCop)}`
                                : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <SelectField
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'open', label: 'Cobros pendientes' },
                    { value: 'late', label: 'Solo vencidos' },
                    { value: 'all', label: 'Todos (incluye pagados y anulados)' },
                  ]}
                />
                <SelectField
                  value={responsibleFilter}
                  onChange={setResponsibleFilter}
                  placeholder="Todos los responsables"
                  options={responsibles.map((r) => ({ value: r.id, label: r.fullName }))}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Para registrar un cobro nuevo, abre la ficha del animal y entra a la pestaña
                Custodia.
              </p>
              <ChargeList
                api={api}
                charges={shownCharges}
                canWrite={canWrite}
                canManage={canManage}
                showAnimal
                onChanged={() => void load()}
              />
            </div>
          </TabsContent>

          <TabsContent value="contratos">
            <ContractList
              api={api}
              contracts={contracts}
              canWrite={canWrite}
              canManage={canManage}
              showAnimal
              onChanged={() => void load()}
            />
          </TabsContent>

          <TabsContent value="plantillas">
            <ul className="space-y-3">
              {templates.map((item) => (
                <li key={item.templateKey} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.name}</span>
                    {item.isBase ? (
                      <Badge variant="info">Base de AdoptaFácil</Badge>
                    ) : (
                      <Badge variant="secondary">Versión {item.version}</Badge>
                    )}
                    {item.archived && <Badge variant="outline">Archivada</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.clauses.filter((c) => c.enabled || c.locked).length} cláusulas activas
                    {item.createdAt
                      ? ` · guardada el ${formatInstant(item.createdAt)} por ${item.createdByName}`
                      : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTemplate({ source: item, mode: 'copy' })}
                      >
                        {item.isBase ? 'Usar como base' : 'Duplicar'}
                      </Button>
                    )}
                    {canManage && !item.isBase && !item.archived && (
                      <Button size="sm" onClick={() => setTemplate({ source: item, mode: 'edit' })}>
                        Editar cláusulas
                      </Button>
                    )}
                    {item.templateKey !== CUSTODY_BASE_TEMPLATE_KEY && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void showVersions(item.templateKey)}
                      >
                        Ver versiones
                      </Button>
                    )}
                    {canManage && !item.isBase && !item.archived && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void archive(item.templateKey)}
                      >
                        Archivar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {versions && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Versiones de {versions[0]?.name}</CardTitle>
                  <CardDescription>
                    Cada contrato emitido conserva la versión con la que se generó.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border text-sm">
                    {versions.map((version) => (
                      <li key={version.version} className="py-2">
                        Versión {version.version} · {version.clauses.length} cláusulas
                        {version.createdAt
                          ? ` · ${formatInstant(version.createdAt)} · ${version.createdByName}`
                          : ''}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={() => setVersions(null)}
                  >
                    Cerrar
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="responsables">
            <div className="mb-3 flex flex-wrap gap-2">
              <Input
                className="min-w-0 flex-1"
                placeholder="Buscar por nombre o documento"
                aria-label="Buscar responsables"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {canWrite && (
                <Button onClick={() => setResponsible({ editing: null })}>Nuevo responsable</Button>
              )}
            </div>
            {shownResponsibles.length === 0 ? (
              <EmptyState
                title="No hay responsables"
                description="Son las personas que entregan un animal, lo tienen a su cargo o responden por los pagos."
              />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {shownResponsibles.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{r.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.documentType} {r.documentNumber}
                        {r.phone ? ` · ${r.phone}` : ''}
                        {r.email ? ` · ${r.email}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void statement(r.id)}>
                        Estado de cuenta
                      </Button>
                      {canWrite && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setResponsible({ editing: r })}
                        >
                          Editar
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      )}

      <TemplateDialog
        api={api}
        open={template !== null}
        source={template?.source ?? null}
        mode={template?.mode ?? 'copy'}
        onClose={() => setTemplate(null)}
        onDone={done}
      />
      <ResponsibleDialog
        api={api}
        open={responsible !== null}
        editing={responsible?.editing}
        onClose={() => setResponsible(null)}
        onSaved={() => done('Responsable guardado.')}
      />
    </PageContainer>
  );
}
