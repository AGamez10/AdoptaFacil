import { useEffect, useState } from 'react';
import {
  type ClinicalReminder,
  ReminderStatus,
  type ReminderType,
  Role,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { Link } from 'react-router-dom';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';

const TYPE_LABELS: Record<string, string> = {
  vaccine: 'Vacuna',
  treatment: 'Tratamiento',
  surgery: 'Cirugía',
  sterilization: 'Esterilización',
  allergy: 'Alergia',
  disability: 'Incapacidad',
  medication: 'Medicamento',
  diagnosis: 'Diagnóstico',
};

const STATUS_LABELS: Record<ReminderStatus, string> = {
  [ReminderStatus.Pending]: 'Pendiente',
  [ReminderStatus.Sent]: 'Pendiente',
  [ReminderStatus.Failed]: 'Pendiente',
  [ReminderStatus.Acknowledged]: 'Atendido',
  [ReminderStatus.Dismissed]: 'Descartado',
};

function statusVariant(status: ReminderStatus): 'default' | 'secondary' | 'destructive' {
  if (status === ReminderStatus.Acknowledged || status === ReminderStatus.Dismissed)
    return 'secondary';
  return 'default';
}

function formatCO(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
}

/** `/recordatorios` — vacunas y tratamientos por poner (recordatorios
 *  clínicos, RF09). Se generan solos a partir de la "Próxima fecha" que se
 *  anota en la historia clínica de un animal, desde 30 días antes
 *  (REMINDERS_WINDOW_DAYS). Ver: roles del animal + auditor; atender/descartar:
 *  sin el auditor. Un fallo del aviso por correo no es asunto de quien lee:
 *  el estado se muestra como "Pendiente". */
export function RemindersInboxPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canResolve =
    hasRole(Role.Owner) ||
    hasRole(Role.Administrator) ||
    hasRole(Role.Operator) ||
    hasRole(Role.Veterinarian);
  const { toast } = useToast();

  const [reminders, setReminders] = useState<ClinicalReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const list = await client.request<ClinicalReminder[]>('/clinical-reminders');
    setReminders(list);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await client.request<ClinicalReminder[]>('/clinical-reminders');
        if (active) setReminders(list);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const resolve = async (id: string, action: 'acknowledge' | 'dismiss'): Promise<void> => {
    setBusy(id);
    try {
      await client.request<ClinicalReminder>(`/clinical-reminders/${id}/${action}`, {
        method: 'POST',
      });
      await load();
      toast({
        title: action === 'acknowledge' ? 'Marcado como hecho' : 'Recordatorio descartado',
      });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const isOpen = (r: ClinicalReminder): boolean =>
    r.status !== ReminderStatus.Acknowledged && r.status !== ReminderStatus.Dismissed;

  return (
    <PageContainer>
      <PageHeader
        title="Vacunas y tratamientos"
        description="Lo que toca ponerle o hacerle a tus animales en los próximos 30 días, y lo que ya se pasó de fecha."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle>Próximas fechas</CardTitle>
          </CardHeader>
          <CardContent>
            {reminders.length === 0 ? (
              <div
                className="space-y-2 text-sm text-muted-foreground"
                data-testid="reminders-empty"
              >
                <p className="font-medium text-foreground">Por ahora no hay nada por poner.</p>
                <p>
                  Aquí aparecen solas las próximas vacunas, desparasitaciones y tratamientos. Para
                  que salga una, entra a un animal, abre su historia clínica y al registrar la
                  vacuna o el tratamiento llena la casilla “Próxima fecha”. Te avisamos desde 30
                  días antes.
                </p>
                <p>
                  <Link to="/animales" className="font-semibold text-primary hover:underline">
                    Ir a mis animales →
                  </Link>
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {reminders.map((reminder) => (
                  <li key={reminder.id} className="border-b pb-2 text-sm last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {TYPE_LABELS[reminder.type as ReminderType] ?? reminder.type}
                      </span>
                      <Badge variant={statusVariant(reminder.status)}>
                        {STATUS_LABELS[reminder.status]}
                      </Badge>
                      <span className="text-muted-foreground">
                        Fecha: {formatCO(reminder.dueDate)}
                      </span>
                      <Link
                        to={`/animales/${reminder.animalId}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        Ver animal
                      </Link>
                    </div>
                    {canResolve && isOpen(reminder) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          disabled={busy === reminder.id}
                          onClick={() => void resolve(reminder.id, 'acknowledge')}
                        >
                          Ya se hizo
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy === reminder.id}
                          onClick={() => void resolve(reminder.id, 'dismiss')}
                        >
                          Descartar
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
