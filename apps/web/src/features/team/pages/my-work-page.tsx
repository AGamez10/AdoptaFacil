import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type MyTeamWork,
  Role,
  TEAM_ASSIGN_ROLES,
  type TeamAssignment,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { completeAssignment, fetchMyWork } from '../api/team-api';
import { MyAnimalCard } from '../components/my-animal-card';
import { TeamAssignmentsPanel } from '../components/team-assignments-panel';

function TaskRow({
  task,
  onComplete,
}: {
  task: TeamAssignment;
  onComplete?: (task: TeamAssignment) => void;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
      <div className="min-w-0 space-y-0.5">
        <div className="font-medium">{task.title}</div>
        {task.details && <p className="text-muted-foreground">{task.details}</p>}
        <div className="text-xs text-muted-foreground">
          Encargada por {task.createdByName}
          {task.dueDate ? ` · para el ${task.dueDate}` : ''}
          {task.animal ? ` · ${task.animal.name}` : ''}
        </div>
        {task.completionNote && (
          <p className="text-xs text-muted-foreground">Nota: {task.completionNote}</p>
        )}
      </div>
      {onComplete ? (
        <Button size="sm" variant="outline" onClick={() => onComplete(task)}>
          Marcar hecha
        </Button>
      ) : (
        <Badge variant="success">Hecha</Badge>
      )}
    </li>
  );
}

/**
 * `/mi-trabajo` — el panel de cada persona del equipo según su cargo
 * (decisión del dueño, 2026-11-22). Voluntario y colaborador temporal ven solo
 * lo suyo: tareas, la ficha básica de los animales a su cargo (sin datos de
 * adoptantes ni donantes), el registro de cuidados y su voluntariado. El
 * veterinario tiene a mano lo clínico; quien coordina, además, encarga trabajo.
 */
export function MyWorkPage() {
  const client = useApiClient();
  const { toast } = useToast();
  const { hasAnyRole, hasRole } = useSession();
  const canAssign = hasAnyRole(...TEAM_ASSIGN_ROLES);
  const isVet = hasRole(Role.Veterinarian);
  const isVolunteerLike = hasAnyRole(Role.Volunteer, Role.TemporaryCollaborator);
  const [work, setWork] = useState<MyTeamWork | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setWork(await fetchMyWork(client));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function complete(task: TeamAssignment) {
    try {
      await completeAssignment(client, task.id);
      toast({ title: 'Tarea hecha', variant: 'success' });
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo marcar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  }

  const tasks = work?.assignments.filter((a) => a.kind === 'task') ?? [];
  const pending = tasks.filter((t) => t.status === 'open');
  const done = tasks.filter((t) => t.status === 'done');

  return (
    <PageContainer>
      <PageHeader
        title="Mi trabajo"
        description="Lo que el equipo te encargó y los animales a tu cargo."
      />

      <div className="space-y-6">
        {isVet && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Panel clínico</CardTitle>
              <CardDescription>
                Lleva la historia clínica, atiende los recordatorios de salud y marca a cada animal
                como apto para adopción. Publicarlo en el portal lo hace un administrador u
                operador, salvo que te den ese permiso.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Link to="/recordatorios" className={buttonVariants({ size: 'sm' })}>
                Recordatorios de salud
              </Link>
              <Link to="/animales" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                Fichas y expediente clínico
              </Link>
            </CardContent>
          </Card>
        )}

        {failed && (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
              <p className="text-sm text-destructive">No se pudo cargar tu trabajo.</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Reintentar
              </Button>
            </CardContent>
          </Card>
        )}

        {!work && !failed && <Skeleton className="h-40 w-full" />}

        {work && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mis tareas · {pending.length}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tienes tareas pendientes.</p>
                ) : (
                  <ul className="divide-y rounded-md border" aria-label="Tareas pendientes">
                    {pending.map((task) => (
                      <TaskRow key={task.id} task={task} onComplete={(t) => void complete(t)} />
                    ))}
                  </ul>
                )}
                {done.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      Hechas en los últimos 30 días ({done.length})
                    </summary>
                    <ul className="mt-2 divide-y rounded-md border" aria-label="Tareas hechas">
                      {done.map((task) => (
                        <TaskRow key={task.id} task={task} />
                      ))}
                    </ul>
                  </details>
                )}
              </CardContent>
            </Card>

            <section className="space-y-3" aria-label="Animales a mi cargo">
              <h2 className="text-lg font-semibold">Animales a mi cargo</h2>
              {work.animals.length === 0 ? (
                <EmptyState title="Aún no tienes animales a tu cargo" />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {work.animals.map((animal) => (
                    <MyAnimalCard key={animal.id} animal={animal} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {isVolunteerLike && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mi voluntariado</CardTitle>
              <CardDescription>
                Inscríbete a las jornadas, registra tus horas y descarga tus certificados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                to="/voluntariado"
                className={buttonVariants({ size: 'sm', variant: 'outline' })}
              >
                Ir a mi voluntariado
              </Link>
            </CardContent>
          </Card>
        )}

        {canAssign && <TeamAssignmentsPanel />}
      </div>
    </PageContainer>
  );
}
