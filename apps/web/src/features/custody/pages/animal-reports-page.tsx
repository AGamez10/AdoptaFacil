import { useCallback, useEffect, useState } from 'react';
import {
  ANIMAL_SEXES,
  ANIMAL_SPECIES,
  ANIMAL_STATUSES,
  CUSTODY_STATUS_LABELS,
  Role,
  type AnimalReportFilters,
  type AnimalReportPreview,
  type CustodyStatus,
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
  friendlyErrorMessage,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useSession } from '../../../shell/auth';
import { openBlob, saveBlob, useCustodyApi } from '../api/custody-api';
import { CheckField, Field, SelectField } from '../components/form-kit';
import {
  ANIMAL_STATUS_LABELS,
  CUSTODY_STATUS_TONE,
  SEX_LABELS,
  SPECIES_LABELS,
  formatDate,
  todayInColombia,
} from '../model/custody-view';

const CUSTODY_OPTIONS = (Object.keys(CUSTODY_STATUS_LABELS) as CustodyStatus[]).map((value) => ({
  value,
  label: CUSTODY_STATUS_LABELS[value],
}));

/**
 * `/reportes-animales` — reporte consolidado de animales con filtros, en PDF,
 * CSV o Excel, y acceso al reporte individual de cada uno.
 */
export function AnimalReportsPage() {
  const api = useCustodyApi();
  const { hasAnyRole } = useSession();
  const { toast } = useToast();
  const canGenerate = hasAnyRole(Role.Owner, Role.Administrator, Role.Operator);

  const [filters, setFilters] = useState<AnimalReportFilters>({});
  const [preview, setPreview] = useState<AnimalReportPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const set = <K extends keyof AnimalReportFilters>(key: K, value: AnimalReportFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value || undefined }));

  const load = useCallback(async () => {
    try {
      setPreview(await api.reportPreview(filters));
      setLoadError(null);
    } catch (error) {
      setLoadError(friendlyErrorMessage(error));
    }
  }, [api, filters]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const download = async (format: 'pdf' | 'csv' | 'xlsx') => {
    setBusy(format);
    try {
      const blob = await api.reportBlob(format, filters);
      if (format === 'pdf') openBlob(blob);
      else saveBlob(blob, `reporte-de-animales-${todayInColombia()}.${format}`);
    } catch (error) {
      toast({
        title: 'No se pudo generar el reporte',
        description: friendlyErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const individual = async (animalId: string) => {
    setBusy(animalId);
    try {
      const doc = await api.individualReport(animalId);
      openBlob(await api.documentBlob(doc.id));
    } catch (error) {
      toast({
        title: 'No se pudo generar el reporte individual',
        description: friendlyErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <PageContainer>
      <PageHeader
        title="Reportes de animales"
        description="Un solo documento con todos los animales que elijas, listo para imprimir o compartir. Sin generar un PDF por cada uno."
      />

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            El reporte incluye lo que ves abajo. Los filtros aplicados quedan escritos en el
            documento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Estado">
              <SelectField
                value={filters.status ?? ''}
                onChange={(value) => set('status', value)}
                placeholder="Todos"
                options={ANIMAL_STATUSES.map((value) => ({
                  value: value as string,
                  label: ANIMAL_STATUS_LABELS[value] ?? value,
                }))}
              />
            </Field>
            <Field label="Especie">
              <SelectField
                value={filters.species ?? ''}
                onChange={(value) => set('species', value)}
                placeholder="Todas"
                options={ANIMAL_SPECIES.map((value) => ({
                  value: value as string,
                  label: SPECIES_LABELS[value] ?? value,
                }))}
              />
            </Field>
            <Field label="Sexo">
              <SelectField
                value={filters.sex ?? ''}
                onChange={(value) => set('sex', value)}
                placeholder="Todos"
                options={ANIMAL_SEXES.map((value) => ({
                  value: value as string,
                  label: SEX_LABELS[value] ?? value,
                }))}
              />
            </Field>
            <Field label="Condición de custodia">
              <SelectField
                value={filters.custody ?? ''}
                onChange={(value) => set('custody', value)}
                placeholder="Todas"
                options={CUSTODY_OPTIONS}
              />
            </Field>
            <Field label="Ingreso desde">
              <Input
                type="date"
                value={filters.intakeFrom ?? ''}
                max={todayInColombia()}
                onChange={(e) => set('intakeFrom', e.target.value)}
              />
            </Field>
            <Field label="Ingreso hasta">
              <Input
                type="date"
                value={filters.intakeTo ?? ''}
                max={todayInColombia()}
                onChange={(e) => set('intakeTo', e.target.value)}
              />
            </Field>
            <Field label="Nombre" className="sm:col-span-2">
              <Input
                placeholder="Buscar por nombre"
                value={filters.search ?? ''}
                maxLength={80}
                onChange={(e) => set('search', e.target.value)}
              />
            </Field>
          </div>
          <CheckField
            checked={Boolean(filters.includeInactive)}
            onChange={(checked) => set('includeInactive', checked)}
          >
            Incluir animales inactivos
          </CheckField>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={busy !== null || !preview || preview.total === 0}
              onClick={() => void download('pdf')}
            >
              {busy === 'pdf' ? 'Generando…' : 'PDF consolidado'}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null || !preview}
              onClick={() => void download('xlsx')}
            >
              {busy === 'xlsx' ? 'Generando…' : 'Excel'}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null || !preview}
              onClick={() => void download('csv')}
            >
              {busy === 'csv' ? 'Generando…' : 'CSV'}
            </Button>
            {hasFilters && (
              <Button variant="ghost" onClick={() => setFilters({})}>
                Quitar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6">
        {loadError ? (
          <EmptyState
            title="No pudimos cargar los animales"
            description={loadError}
            action={<Button onClick={() => void load()}>Reintentar</Button>}
          />
        ) : !preview ? (
          <Skeleton className="h-40 w-full" />
        ) : preview.total === 0 ? (
          <EmptyState
            title="Ningún animal coincide con los filtros"
            description="Ajusta los filtros para incluir animales en el reporte."
          />
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
              {preview.total} {preview.total === 1 ? 'animal' : 'animales'} en el reporte
              {preview.rows.length < preview.total
                ? ` · se muestran los primeros ${preview.rows.length}`
                : ''}
              {preview.truncated ? ` · el PDF incluye hasta ${preview.limit}` : ''}
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {preview.rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {row.name}{' '}
                      <span className="text-sm font-normal text-muted-foreground">
                        · {row.code}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {SPECIES_LABELS[row.species] ?? row.species}
                      {row.breed ? ` · ${row.breed}` : ''} · {SEX_LABELS[row.sex] ?? row.sex} ·{' '}
                      {row.ageLabel} · ingreso {formatDate(row.intakeDate)}
                      {row.intakeDateSource === 'system_record' ? ' (fecha de registro)' : ''}
                      {row.responsibleName ? ` · ${row.responsibleName}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {ANIMAL_STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                    <Badge variant={CUSTODY_STATUS_TONE[row.custodyStatus]}>
                      {CUSTODY_STATUS_LABELS[row.custodyStatus]}
                    </Badge>
                    {canGenerate && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void individual(row.id)}
                      >
                        {busy === row.id ? 'Generando…' : 'Reporte individual'}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </PageContainer>
  );
}
