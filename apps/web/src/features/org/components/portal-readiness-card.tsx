import { Link } from 'react-router-dom';
import type { Organization, OrganizationStatus } from '@adoptafacil/contracts';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@adoptafacil/ui';
import { portalReadiness, type PortalReadinessItem } from '../lib/portal-readiness';

export interface PortalReadinessCardProps {
  org: Organization;
  /** Estado de revisión de la plataforma; null mientras no se conoce. */
  status: OrganizationStatus | null;
}

function Item({ item }: { item: PortalReadinessItem }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span
        aria-hidden
        className={
          item.done
            ? 'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success text-[11px] font-bold text-success-foreground'
            : 'mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/40'
        }
      >
        {item.done ? '✓' : ''}
      </span>
      <span className="flex-1">
        <span className={item.done ? 'text-muted-foreground line-through' : 'text-foreground'}>
          {item.label}
        </span>
        <span className="sr-only">{item.done ? ' (listo)' : ' (pendiente)'}</span>
        {!item.done && item.tab && (
          <>
            {' · '}
            <Link
              to={`/organizacion?tab=${item.tab}`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Completar
            </Link>
          </>
        )}
      </span>
    </li>
  );
}

/**
 * "Qué falta para publicar tu portal" en "Mi organización". Mientras falte lo
 * obligatorio, nada de lo que la organización registre (animales, campañas,
 * necesidades…) se ve en su portal ni en el catálogo general. Desaparece cuando
 * el portal ya es público.
 */
export function PortalReadinessCard({ org, status }: PortalReadinessCardProps) {
  const items = portalReadiness(org, status);
  const required = items.filter((item) => item.required);
  const optional = items.filter((item) => !item.required);
  if (required.every((item) => item.done)) return null;

  return (
    <Card
      className="border-warning-foreground/40 bg-warning/10"
      data-testid="portal-readiness-card"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Tu portal público todavía no se muestra</CardTitle>
          <CardDescription>
            Mientras falte lo obligatorio, nadie ve lo que registres: ni tus animales, ni tus
            campañas, ni la información de tu organización. Complétalo primero.
          </CardDescription>
        </div>
        <Badge variant="warning">
          {required.filter((item) => item.done).length} de {required.length} listos
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Obligatorio para publicar
          </h3>
          <ul className="space-y-2">
            {required.map((item) => (
              <Item key={item.key} item={item} />
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Para que tu portal se vea completo
          </h3>
          <ul className="space-y-2">
            {optional.map((item) => (
              <Item key={item.key} item={item} />
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
