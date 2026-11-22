import { useCallback, useEffect, useState } from 'react';
import {
  type Animal,
  invitationRoleCopy,
  type TeamAssignee,
  type TeamAssignment,
  TEAM_ASSIGNMENT_KIND_LABELS,
  type TeamAssignmentKind,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import {
  cancelAssignment,
  createAssignment,
  fetchAssignees,
  fetchTeamAssignments,
} from '../api/team-api';

const fieldClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/**
 * Encargos del equipo, para quien coordina (propietario, administrador,
 * operador): le encarga a una persona una tarea o un animal a su cargo, y ve
 * lo pendiente de todos.
 */
export function TeamAssignmentsPanel() {
  const client = useApiClient();
  const { toast } = useToast();
  const [assignees, setAssignees] = useState<TeamAssignee[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [open, setOpen] = useState<TeamAssignment[]>([]);
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [kind, setKind] = useState<TeamAssignmentKind>('task');
  const [animalId, setAnimalId] = useState('');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [people, pending, list] = await Promise.all([
      fetchAssignees(client),
      fetchTeamAssignments(client),
      client.request<Animal[]>('/animals').catch(() => [] as Animal[]),
    ]);
    setAssignees(people);
    setOpen(pending);
    setAnimals(list.filter((a) => a.status !== 'adopted' && a.status !== 'deceased'));
  }, [client]);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await createAssignment(client, {
        assigneeUserId,
        kind,
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(details.trim() ? { details: details.trim() } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(animalId ? { animalId } : {}),
      });
      toast({ title: 'Encargo creado', variant: 'success' });
      setTitle('');
      setDetails('');
      setDueDate('');
      setAnimalId('');
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo crear el encargo',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(assignment: TeamAssignment) {
    try {
      await cancelAssignment(client, assignment.id);
      toast({ title: 'Encargo cancelado', variant: 'success' });
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo cancelar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Encargos del equipo</CardTitle>
        <CardDescription>
          Asigna tareas o deja un animal a cargo de alguien. La persona lo ve en su panel y recibe
          un aviso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit} aria-label="Nuevo encargo">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Persona</span>
            <select
              required
              className={fieldClass}
              value={assigneeUserId}
              onChange={(e) => setAssigneeUserId(e.target.value)}
            >
              <option value="">Elige a alguien del equipo</option>
              {assignees.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.displayName} ·{' '}
                  {person.roles.map((r) => invitationRoleCopy(r).label).join(', ')}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Tipo</span>
            <select
              className={fieldClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as TeamAssignmentKind)}
            >
              <option value="task">{TEAM_ASSIGNMENT_KIND_LABELS.task}</option>
              <option value="animal_care">{TEAM_ASSIGNMENT_KIND_LABELS.animal_care}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Animal{kind === 'animal_care' ? '' : ' (opcional)'}</span>
            <select
              required={kind === 'animal_care'}
              className={fieldClass}
              value={animalId}
              onChange={(e) => setAnimalId(e.target.value)}
            >
              <option value="">{kind === 'animal_care' ? 'Elige el animal' : 'Ninguno'}</option>
              {animals.map((animal) => (
                <option key={animal.id} value={animal.id}>
                  {animal.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Para cuándo (opcional)</span>
            <input
              type="date"
              className={fieldClass}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">
              {kind === 'task' ? 'Tarea' : 'Título (opcional: «Cuidar a …»)'}
            </span>
            <input
              required={kind === 'task'}
              minLength={2}
              maxLength={160}
              className={fieldClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Indicaciones (opcional)</span>
            <textarea
              maxLength={2000}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || !assigneeUserId}>
              {busy ? 'Guardando…' : 'Crear encargo'}
            </Button>
          </div>
        </form>

        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay encargos pendientes.</p>
        ) : (
          <ul className="divide-y rounded-md border" aria-label="Encargos pendientes">
            {open.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium">{assignment.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {assignment.assigneeName}
                    {assignment.dueDate ? ` · para el ${assignment.dueDate}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{TEAM_ASSIGNMENT_KIND_LABELS[assignment.kind]}</Badge>
                  <Button size="sm" variant="outline" onClick={() => void cancel(assignment)}>
                    Cancelar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
