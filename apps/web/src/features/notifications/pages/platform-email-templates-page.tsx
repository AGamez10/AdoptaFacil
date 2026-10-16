import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Role, type EmailTemplateSummary } from '@adoptafacil/contracts';
import { Badge, Card, CardContent, EmptyState, Skeleton } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { CATEGORY_LABELS, THEME_ICONS } from '../lib/email-template-labels';

/**
 * `/plataforma/correos` — the superadmin's list of every email the platform
 * sends, grouped into service emails and bulk sends. Each row says who gets
 * it, whether it is on, and whether it uses the original copy or a custom
 * version. PlatformAdmin/PlatformSuperAdmin (same gate as `/plataforma/*`).
 */
export function PlatformEmailTemplatesPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canView = hasRole(Role.PlatformAdmin) || hasRole(Role.PlatformSuperAdmin);
  const [items, setItems] = useState<EmailTemplateSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!canView) return;
    let active = true;
    client
      .request<EmailTemplateSummary[]>('/platform/email-templates')
      .then((rows) => active && setItems(rows))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [client, canView]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = (items ?? []).filter(
      (i) => !q || `${i.label} ${i.description} ${i.audience}`.toLowerCase().includes(q),
    );
    return (['transactional', 'bulk'] as const).map((category) => ({
      category,
      rows: visible.filter((i) => i.category === category),
    }));
  }, [items, query]);

  if (!canView) {
    return (
      <PageContainer>
        <PageHeader title="Correos" description="Acceso restringido." />
        <EmptyState title="Sin acceso" description="No tienes permisos de plataforma." />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Correos"
        description="Personaliza lo que reciben donantes, padrinos, adoptantes, voluntarios y refugios. Cada cambio queda guardado como una versión y puedes volver atrás cuando quieras."
      />
      <div className="mb-6">
        <label htmlFor="email-search" className="sr-only">
          Buscar correo
        </label>
        <input
          id="email-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar: donación, contrato, voluntariado…"
          className="h-11 w-full max-w-md rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      {failed && (
        <EmptyState
          title="No pudimos cargar los correos"
          description="Inténtalo de nuevo en un momento."
        />
      )}
      {!failed && !items && <Skeleton className="h-96 w-full" />}

      {items &&
        groups.map(({ category, rows }) => (
          <section key={category} className="mb-8" aria-labelledby={`group-${category}`}>
            <h2 id={`group-${category}`} className="mb-1 text-lg font-semibold">
              {CATEGORY_LABELS[category].title}
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">{CATEGORY_LABELS[category].hint}</p>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ningún correo coincide con la búsqueda.
              </p>
            ) : (
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {rows.map((row) => (
                    <Link
                      key={row.event}
                      to={`/plataforma/correos/${encodeURIComponent(row.event)}`}
                      className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                      data-testid={`email-row-${row.event}`}
                    >
                      <span aria-hidden className="mt-0.5 text-2xl leading-none">
                        {THEME_ICONS[row.theme]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{row.label}</span>
                        <span className="block text-sm text-muted-foreground">
                          {row.description} ·{' '}
                          <span className="whitespace-nowrap">Para: {row.audience}</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        {row.required ? (
                          <Badge variant="info">Obligatorio</Badge>
                        ) : row.enabled ? (
                          <Badge variant="success">Activo</Badge>
                        ) : (
                          <Badge variant="secondary">Apagado</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {row.activeVersion ? `Versión ${row.activeVersion}` : 'Texto original'}
                        </span>
                      </span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>
        ))}
    </PageContainer>
  );
}
