import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Role,
  type SensitiveActionRequest,
  type SensitiveActionType,
  type WorkspaceActivityItem,
  type WorkspaceMe,
  type WorkspaceTeamMember,
  type WorkspaceTicket,
  type WorkspaceTicketDetail,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { CodeInput } from '../components/code-input';
import { workspaceApi, type WorkspaceApi } from '../model/workspace-api';
import {
  ACTION_TYPE_LABEL,
  APPROVAL_STATUS_LABEL,
  colombiaDateTime,
  describeApproval,
  roleLabel,
  TICKET_STATUS_LABEL,
  workspaceErrorMessage,
} from '../model/workspace-format';

const SELECT_CLASS =
  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary';

interface Shared {
  api: WorkspaceApi;
  me: WorkspaceMe;
  members: WorkspaceTeamMember[];
  nameOf: (userId: string | null | undefined) => string;
  isLead: boolean;
  notify: (title: string, description?: string, failed?: boolean) => void;
}

/**
 * `/plataforma/equipo` — F19 · espacio de trabajo del equipo de plataforma.
 * Todo lo que se ve aquí es SOLO del equipo de quien entra (otro equipo no lo
 * ve ni lo cambia): tareas de revisión, aprobaciones de doble firma, personas
 * del equipo y su bitácora. Fechas en hora de Colombia.
 */
export function PlatformTeamPage() {
  const client = useApiClient();
  const api = useMemo(() => workspaceApi(client), [client]);
  const { toast } = useToast();
  const [me, setMe] = useState<WorkspaceMe | null>(null);
  const [members, setMembers] = useState<WorkspaceTeamMember[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [who, team] = await Promise.all([api.me(), api.team()]);
      setMe(who);
      setMembers(team);
    } catch {
      setFailed(true);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const notify = useCallback(
    (title: string, description?: string, isError = false) =>
      toast({ title, description, variant: isError ? 'destructive' : 'info' }),
    [toast],
  );

  if (failed) {
    return (
      <PageContainer>
        <ErrorState
          title="No pudimos abrir el espacio del equipo"
          description="Revisa tu conexión e inténtalo de nuevo."
          onRetry={() => void load()}
        />
      </PageContainer>
    );
  }
  if (!me) {
    return (
      <PageContainer>
        <Skeleton className="h-40 w-full" />
      </PageContainer>
    );
  }

  const nameOf = (userId: string | null | undefined) => {
    if (!userId) return 'Nadie';
    if (userId === me.userId) return 'Tú';
    const member = members.find((m) => m.userId === userId);
    return member ? member.displayName || member.email : 'Alguien que ya no está en el equipo';
  };
  const shared: Shared = {
    api,
    me,
    members,
    nameOf,
    isLead: me.roles.includes(Role.PlatformSuperAdmin),
    notify,
  };

  return (
    <PageContainer>
      <PageHeader
        title={`Equipo · ${me.teamName}`}
        description="Tareas, aprobaciones y actividad de tu equipo. Lo que ves aquí solo lo ve tu equipo."
      />
      <Tabs defaultValue="tareas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tareas">Tareas</TabsTrigger>
          <TabsTrigger value="aprobaciones">Aprobaciones</TabsTrigger>
          <TabsTrigger value="equipo">Equipo</TabsTrigger>
          <TabsTrigger value="actividad">Actividad</TabsTrigger>
          <TabsTrigger value="seguridad">Mi seguridad</TabsTrigger>
        </TabsList>
        <TabsContent value="tareas">
          <TicketsTab {...shared} />
        </TabsContent>
        <TabsContent value="aprobaciones">
          <ApprovalsTab {...shared} />
        </TabsContent>
        <TabsContent value="equipo">
          <TeamTab {...shared} />
        </TabsContent>
        <TabsContent value="actividad">
          <ActivityTab {...shared} />
        </TabsContent>
        <TabsContent value="seguridad">
          <SecurityTab {...shared} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// -----------------------------------------------------------------------------
// Tareas
// -----------------------------------------------------------------------------

function ticketBadge(status: WorkspaceTicket['status']) {
  const variant =
    status === 'open'
      ? 'warning'
      : status === 'resolved'
        ? 'secondary'
        : status === 'in_progress'
          ? 'info'
          : 'outline';
  return <Badge variant={variant}>{TICKET_STATUS_LABEL[status]}</Badge>;
}

function TicketsTab({ api, me, nameOf, isLead, notify }: Shared) {
  const [tickets, setTickets] = useState<WorkspaceTicket[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTickets(await api.tickets());
    } catch (error) {
      notify('No pudimos cargar las tareas', workspaceErrorMessage(error), true);
      setTickets([]);
    }
  }, [api, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      notify(done);
    } catch (error) {
      notify('No se pudo', workspaceErrorMessage(error), true);
    } finally {
      setBusy(false);
      await load();
    }
  };

  if (!tickets) return <Skeleton className="h-32 w-full" />;
  if (tickets.length === 0) {
    return (
      <EmptyState
        title="No hay organizaciones esperando revisión"
        description="Cuando una organización envíe su información, aparecerá aquí como tarea."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Cada organización en revisión es una tarea. Tómala antes de revisarla para que nadie más del
        equipo trabaje el mismo caso.
      </p>
      {tickets.map((ticket) => {
        const mine = ticket.assigneeUserId === me.userId;
        const canManage = mine || isLead;
        return (
          <Card key={ticket.id}>
            <CardContent className="space-y-3 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{ticket.subjectOrganizationName}</p>
                  <p className="text-xs text-muted-foreground">
                    Responsable: {nameOf(ticket.assigneeUserId)} · Último cambio:{' '}
                    {colombiaDateTime(ticket.updatedAt)}
                  </p>
                </div>
                {ticketBadge(ticket.status)}
              </div>
              <div className="flex flex-wrap gap-2">
                {ticket.status !== 'resolved' && !ticket.assigneeUserId && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void act(() => api.take(ticket.id, ticket.version), 'Tarea tomada')
                    }
                  >
                    Tomar
                  </Button>
                )}
                {ticket.status !== 'resolved' && ticket.assigneeUserId && canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act(() => api.release(ticket.id, ticket.version), 'Tarea liberada')
                    }
                  >
                    Soltar
                  </Button>
                )}
                {ticket.status === 'in_progress' && canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => api.changeStatus(ticket.id, ticket.version, 'waiting_org'),
                        'Marcada como esperando a la organización',
                      )
                    }
                  >
                    Esperando a la organización
                  </Button>
                )}
                {ticket.status !== 'resolved' && ticket.assigneeUserId && canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => api.changeStatus(ticket.id, ticket.version, 'resolved'),
                        'Tarea cerrada',
                      )
                    }
                  >
                    Cerrar
                  </Button>
                )}
                {ticket.status === 'resolved' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => api.changeStatus(ticket.id, ticket.version, 'open'),
                        'Tarea reabierta',
                      )
                    }
                  >
                    Reabrir
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpenId(openId === ticket.id ? null : ticket.id)}
                >
                  {openId === ticket.id ? 'Ocultar historial' : 'Historial y notas'}
                </Button>
              </div>
              {openId === ticket.id && (
                <TicketHistory
                  api={api}
                  ticketId={ticket.id}
                  nameOf={nameOf}
                  notify={notify}
                  onChanged={load}
                />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TicketHistory({
  api,
  ticketId,
  nameOf,
  notify,
  onChanged,
}: Pick<Shared, 'api' | 'nameOf' | 'notify'> & {
  ticketId: string;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<WorkspaceTicketDetail | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await api.ticket(ticketId));
    } catch (error) {
      notify('No pudimos cargar el historial', workspaceErrorMessage(error), true);
    }
  }, [api, ticketId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.addNote(ticketId, note.trim());
      setNote('');
      await load();
      await onChanged();
    } catch (error) {
      notify('No se guardó la nota', workspaceErrorMessage(error), true);
    } finally {
      setBusy(false);
    }
  };

  if (!detail) return <Skeleton className="h-16 w-full" />;
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <ol className="space-y-2 text-sm">
        {detail.events.map((event) => (
          <li key={event.id}>
            <span className="text-muted-foreground">{colombiaDateTime(event.createdAt)} · </span>
            <span className="font-medium">
              {event.actorUserId ? nameOf(event.actorUserId) : 'Sistema'}
            </span>
            {' · '}
            {TICKET_STATUS_LABEL[event.status]}
            {event.note && <p className="whitespace-pre-wrap pl-2">“{event.note}”</p>}
          </li>
        ))}
      </ol>
      <form onSubmit={(event) => void submit(event)} className="space-y-2">
        <label htmlFor={`note-${ticketId}`} className="text-sm font-medium">
          Agregar una nota para el equipo
        </label>
        <textarea
          id={`note-${ticketId}`}
          className="min-h-[4rem] w-full rounded-md border border-border bg-background p-2 text-sm"
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ej.: falta el RUT vigente; ya les escribimos."
        />
        <Button size="sm" type="submit" disabled={busy || note.trim().length === 0}>
          Guardar nota
        </Button>
      </form>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Aprobaciones (doble firma)
// -----------------------------------------------------------------------------

const STAFF_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

function approvalBadge(status: SensitiveActionRequest['status']) {
  const variant =
    status === 'pending'
      ? 'warning'
      : status === 'approved'
        ? 'success'
        : status === 'rejected'
          ? 'destructive'
          : 'secondary';
  return <Badge variant={variant}>{APPROVAL_STATUS_LABEL[status]}</Badge>;
}

function ApprovalsTab(shared: Shared) {
  const { api, notify } = shared;
  const [requests, setRequests] = useState<SensitiveActionRequest[] | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests(await api.approvals());
    } catch (error) {
      notify('No pudimos cargar las aprobaciones', workspaceErrorMessage(error), true);
      setRequests([]);
    }
  }, [api, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Las acciones delicadas (sumar o quitar personas y roles, reiniciar la verificación de
        alguien, exportar la bitácora) necesitan dos personas: una la pide con un motivo y otra
        persona líder del equipo la aprueba con su código.
      </p>
      <RequestForm {...shared} onCreated={load} />
      {!requests ? (
        <Skeleton className="h-24 w-full" />
      ) : requests.length === 0 ? (
        <EmptyState
          title="No hay solicitudes"
          description="Cuando alguien pida una acción delicada, aparecerá aquí."
        />
      ) : (
        requests.map((request) => (
          <ApprovalCard key={request.id} request={request} shared={shared} onChanged={load} />
        ))
      )}
    </div>
  );
}

function RequestForm({
  api,
  me,
  members,
  isLead,
  notify,
  onCreated,
}: Shared & { onCreated: () => Promise<void> }) {
  const types: SensitiveActionType[] = isLead
    ? ['staff.invite', 'staff.role_grant', 'staff.role_revoke', 'staff.mfa_reset', 'audit.export']
    : ['audit.export'];
  const [type, setType] = useState<SensitiveActionType>(types[0]);
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<Role>(Role.PlatformAdmin);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const others = members.filter((m) => m.userId !== me.userId);
  const payload = (): Record<string, string> => {
    switch (type) {
      case 'staff.invite':
        return { email: email.trim(), role };
      case 'staff.role_grant':
      case 'staff.role_revoke':
        return { userId, role };
      case 'staff.mfa_reset':
        return { userId };
      default:
        return { from, to };
    }
  };
  const ready =
    reason.trim().length >= 5 &&
    (type === 'staff.invite'
      ? /.+@.+\..+/.test(email)
      : type === 'audit.export'
        ? Boolean(from && to && from <= to)
        : Boolean(userId));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.requestApproval({ type, payload: payload() as never, reason: reason.trim() });
      notify('Solicitud enviada', 'Otra persona líder del equipo debe aprobarla.');
      setReason('');
      setEmail('');
      await onCreated();
    } catch (error) {
      notify('No se pudo enviar la solicitud', workspaceErrorMessage(error), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pedir una acción delicada</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="approval-type" className="text-sm font-medium">
              ¿Qué necesitas?
            </label>
            <select
              id="approval-type"
              className={SELECT_CLASS}
              value={type}
              onChange={(event) => setType(event.target.value as SensitiveActionType)}
            >
              {types.map((option) => (
                <option key={option} value={option}>
                  {ACTION_TYPE_LABEL[option]}
                </option>
              ))}
            </select>
          </div>
          {type === 'staff.invite' && (
            <div className="space-y-1">
              <label htmlFor="approval-email" className="text-sm font-medium">
                Correo de la persona
              </label>
              <Input
                id="approval-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          )}
          {(type === 'staff.role_grant' ||
            type === 'staff.role_revoke' ||
            type === 'staff.mfa_reset') && (
            <div className="space-y-1">
              <label htmlFor="approval-member" className="text-sm font-medium">
                Persona del equipo
              </label>
              <select
                id="approval-member"
                className={SELECT_CLASS}
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
              >
                <option value="">Elige a alguien</option>
                {others.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName} ({member.email})
                  </option>
                ))}
              </select>
            </div>
          )}
          {(type === 'staff.invite' ||
            type === 'staff.role_grant' ||
            type === 'staff.role_revoke') && (
            <div className="space-y-1">
              <label htmlFor="approval-role" className="text-sm font-medium">
                Rol
              </label>
              <select
                id="approval-role"
                className={SELECT_CLASS}
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {STAFF_ROLES.map((option) => (
                  <option key={option} value={option}>
                    {roleLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {type === 'audit.export' && (
            <>
              <div className="space-y-1">
                <label htmlFor="approval-from" className="text-sm font-medium">
                  Desde
                </label>
                <Input
                  id="approval-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="approval-to" className="text-sm font-medium">
                  Hasta
                </label>
                <Input
                  id="approval-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="approval-reason" className="text-sm font-medium">
              Motivo (lo verá quien apruebe)
            </label>
            <textarea
              id="approval-reason"
              className="min-h-[4rem] w-full rounded-md border border-border bg-background p-2 text-sm"
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || !ready}>
              Enviar para aprobación
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ApprovalCard({
  request,
  shared,
  onChanged,
}: {
  request: SensitiveActionRequest;
  shared: Shared;
  onChanged: () => Promise<void>;
}) {
  const { api, me, nameOf, isLead, notify } = shared;
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = request.requestedByUserId === me.userId;
  const canDecide = request.status === 'pending' && isLead && !mine;

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      notify(done);
      setCode('');
      setNote('');
    } catch (error) {
      notify('No se pudo', workspaceErrorMessage(error), true);
    } finally {
      setBusy(false);
      await onChanged();
    }
  };

  const download = async () => {
    try {
      const blob = await api.downloadExport(request.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bitacora-equipo-${request.id.slice(0, 8)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify('No se pudo descargar', workspaceErrorMessage(error), true);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-2 pt-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{describeApproval(request, nameOf)}</p>
          {approvalBadge(request.status)}
        </div>
        <p className="text-muted-foreground">
          Pedida por {nameOf(request.requestedByUserId)} el {colombiaDateTime(request.requestedAt)}
          {request.status === 'pending' && ` · vence el ${colombiaDateTime(request.expiresAt)}`}
        </p>
        <p>Motivo: “{request.reason}”</p>
        {request.decidedAt && (
          <p className="text-muted-foreground">
            {APPROVAL_STATUS_LABEL[request.status]} por {nameOf(request.decidedByUserId)} el{' '}
            {colombiaDateTime(request.decidedAt)}
            {request.decisionNote && ` · “${request.decisionNote}”`}
          </p>
        )}
        {canDecide && (
          <div className="space-y-2 border-t border-border pt-2">
            <CodeInput
              id={`approve-code-${request.id}`}
              label="Tu código para aprobar"
              value={code}
              onChange={setCode}
              disabled={busy}
            />
            <div className="space-y-1">
              <label htmlFor={`decision-note-${request.id}`} className="text-sm font-medium">
                Comentario (obligatorio para rechazar)
              </label>
              <Input
                id={`decision-note-${request.id}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || code.length !== 6}
                onClick={() =>
                  void act(
                    () => api.approve(request.id, code, note.trim() || undefined),
                    'Aprobada',
                  )
                }
              >
                Aprobar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || note.trim().length < 3}
                onClick={() => void act(() => api.reject(request.id, note.trim()), 'Rechazada')}
              >
                Rechazar
              </Button>
            </div>
          </div>
        )}
        {request.status === 'pending' && mine && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">
              Esperando a otra persona líder del equipo.
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void act(() => api.cancel(request.id), 'Cancelada')}
            >
              Cancelar
            </Button>
          </div>
        )}
        {request.type === 'audit.export' &&
          request.status === 'approved' &&
          mine &&
          request.downloadableUntil &&
          new Date(request.downloadableUntil).getTime() > Date.now() && (
            <Button size="sm" variant="outline" onClick={() => void download()}>
              Descargar CSV (hasta {colombiaDateTime(request.downloadableUntil)})
            </Button>
          )}
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Equipo, actividad y seguridad
// -----------------------------------------------------------------------------

function TeamTab({ members, me }: Shared) {
  return (
    <div className="space-y-2">
      {members.map((member) => (
        <Card key={member.userId}>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4 text-sm">
            <div>
              <p className="font-medium">
                {member.displayName}
                {member.userId === me.userId && ' (tú)'}
              </p>
              <p className="text-muted-foreground">
                {member.email} · {member.roles.map(roleLabel).join(', ')} · en el equipo desde{' '}
                {colombiaDateTime(member.joinedAt)}
              </p>
            </div>
            <Badge variant={member.mfaEnrolled ? 'success' : 'warning'}>
              {member.mfaEnrolled
                ? 'Verificación en dos pasos activa'
                : 'Sin verificación en dos pasos'}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const ACTIVITY_LABEL: Record<string, string> = {
  'platform.request': 'Usó una herramienta de plataforma',
  'auth.mfa.verified': 'Confirmó su código',
  'auth.mfa.enrolled': 'Activó la verificación en dos pasos',
  'auth.mfa.failed': 'Escribió un código incorrecto',
  'auth.mfa.reset': 'Se reinició la verificación en dos pasos',
  'workspace.approval.requested': 'Pidió una acción delicada',
  'workspace.approval.approved': 'Aprobó una acción delicada',
  'workspace.approval.rejected': 'Rechazó una acción delicada',
  'workspace.approval.cancelled': 'Canceló su solicitud',
  'workspace.audit_export.downloaded': 'Descargó una exportación de la bitácora',
  'workspace.ticket.assigned': 'Tomó una tarea',
  'workspace.ticket.released': 'Soltó una tarea',
  'workspace.ticket.status_changed': 'Cambió el estado de una tarea',
  'workspace.ticket.note': 'Agregó una nota',
  'workspace.ticket.reopened': 'Reabrió una tarea',
};

function ActivityTab({ api, nameOf, notify }: Shared) {
  const [items, setItems] = useState<WorkspaceActivityItem[] | null>(null);

  useEffect(() => {
    api
      .activity(100)
      .then(setItems)
      .catch((error: unknown) => {
        notify('No pudimos cargar la actividad', workspaceErrorMessage(error), true);
        setItems([]);
      });
  }, [api, notify]);

  if (!items) return <Skeleton className="h-32 w-full" />;
  if (items.length === 0) return <EmptyState title="Sin actividad todavía" description="" />;
  return (
    <div className="space-y-1 text-sm">
      <p className="text-muted-foreground">
        Bitácora inmutable del equipo: nadie, ni siquiera un líder, puede editarla o borrarla.
      </p>
      <ol className="divide-y divide-border">
        {items.map((item) => {
          const route = (item.metadata as { route?: string; method?: string }).route;
          return (
            <li key={item.id} className="py-2">
              <span className="text-muted-foreground">{colombiaDateTime(item.createdAt)} · </span>
              <span className="font-medium">{item.actorEmail ?? nameOf(item.actorUserId)}</span>
              {' · '}
              {ACTIVITY_LABEL[item.action] ?? item.action}
              {route && <span className="text-muted-foreground"> ({route})</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SecurityTab({ me }: Shared) {
  const minutes = (seconds: number) => Math.round(seconds / 60);
  return (
    <Card>
      <CardContent className="space-y-2 pt-4 text-sm">
        <p>
          <span className="font-medium">Verificación en dos pasos:</span>{' '}
          {me.mfa.enrolled ? 'activa' : 'sin activar'}
          {me.mfa.verifiedUntil &&
            ` · tu código vale hasta ${colombiaDateTime(me.mfa.verifiedUntil)}`}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            Te pedimos el código al empezar la jornada (máximo{' '}
            {minutes(me.policy.mfaSessionMaxSeconds) / 60} horas).
          </li>
          <li>
            Si la sesión pasa {minutes(me.policy.idleTimeoutSeconds)} minutos sin uso, te lo pedimos
            de nuevo.
          </li>
          <li>
            Las acciones delicadas necesitan la aprobación de otra persona líder con su propio
            código.
          </li>
          <li>
            Una solicitud sin decidir vence en {minutes(me.policy.sensitiveActionTtlSeconds) / 60}{' '}
            horas.
          </li>
          <li>
            Todo lo que haces con las herramientas de plataforma queda en la bitácora del equipo.
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
