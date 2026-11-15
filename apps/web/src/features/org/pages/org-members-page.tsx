import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  INVITABLE_ORG_ROLES,
  ORG_ROLES,
  PLAN_REQUIRED_CODE,
  Role,
  invitationRoleCopy,
  type OrganizationInvitation,
  type OrgTeamMember,
  type OrgTeamView,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { ApiError, useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';

/**
 * `/organizacion/miembros` — el equipo de la organización. El propietario y
 * los administradores invitan personas por correo con un cargo FIJO, cambian
 * el cargo de cada una y la retiran. Lo que hace cada cargo sale de
 * `invitationRoleCopy` (el mismo texto del correo de invitación, derivado de
 * los `@Roles` de la API). Los firmantes (contador, revisor fiscal) se
 * gestionan en "Firmantes" y no ocupan puesto del plan.
 *
 * Nada aquí decide permisos: el servidor los vuelve a exigir en cada llamada.
 */

const SIGNER_LABEL = { accountant: 'Contador/a', fiscal_reviewer: 'Revisor/a fiscal' } as const;

const DATE_CO = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' });

const label = (role: Role) => invitationRoleCopy(role).label;

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === PLAN_REQUIRED_CODE) {
      return 'Tu plan ya no tiene puestos libres. Mejora tu plan o retira a alguien del equipo.';
    }
    if (error.status === 409 && /account|cuenta/i.test(error.message)) {
      return 'Ese correo ya tiene una cuenta en AdoptaFácil. Si es alguien que retiraste, devuélvele el acceso en "Personas sin acceso".';
    }
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function RoleGuide() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Qué puede hacer cada cargo</CardTitle>
        <CardDescription>
          Los cargos son fijos: eliges uno por persona y el sistema le muestra solo lo que ese cargo
          permite. Esto es exactamente lo que la persona lee en su correo de invitación.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {ORG_ROLES.map((role) => {
          const copy = invitationRoleCopy(role);
          return (
            <details key={role} className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {copy.label}
                <span className="font-normal text-muted-foreground"> · {copy.summary}</span>
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {copy.duties.map((duty) => (
                  <li key={duty}>{duty}</li>
                ))}
              </ul>
            </details>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function OrgMembersPage() {
  const client = useApiClient();
  const { user, hasRole } = useSession();
  const { toast } = useToast();
  const isOwner = hasRole(Role.Owner);

  const [team, setTeam] = useState<OrgTeamView | null>(null);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(Role.Operator);
  const [busy, setBusy] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [restoreRole, setRestoreRole] = useState<Record<string, Role>>({});

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [view, invites] = await Promise.all([
        client.request<OrgTeamView>('/org/members'),
        client.request<OrganizationInvitation[]>('/org/invitations'),
      ]);
      setTeam(view);
      // Las invitaciones de firmantes viven en "Firmantes".
      setInvitations((invites ?? []).filter((i) => i.status === 'pending' && !i.signerRole));
    } catch {
      setLoadError(true);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const seats = team?.seats;
  const taken = seats ? seats.used + seats.pendingInvitations : 0;
  const full = Boolean(seats && seats.limit !== null && taken >= seats.limit);
  /** Cargos que quien gestiona puede dar: solo un propietario da el de propietario. */
  const assignable = ORG_ROLES.filter((r) => r !== Role.Owner || isOwner);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setDevLink(null);
    try {
      const created = await client.request<OrganizationInvitation>('/org/invitations', {
        method: 'POST',
        json: { email: email.trim(), role },
      });
      toast({
        title: created.emailDelivery === 'simulated' ? 'Invitación creada' : 'Invitación enviada',
        description:
          created.emailDelivery === 'simulated'
            ? 'Este servidor no envía correos reales: la persona no recibirá nada todavía.'
            : `Le llegó un correo a ${created.email} con el enlace para crear su cuenta. Vence en 7 días.`,
        variant: 'success',
      });
      if (created.simulatedInviteLink) setDevLink(created.simulatedInviteLink);
      setEmail('');
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo invitar',
        description: errorText(error, 'Inténtalo de nuevo.'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  async function act(run: () => Promise<unknown>, ok: string, fail: string) {
    try {
      await run();
      toast({ title: ok, variant: 'success' });
    } catch (error) {
      toast({
        title: fail,
        description: errorText(error, 'Inténtalo de nuevo.'),
        variant: 'destructive',
      });
    }
    await load();
  }

  const changeRole = (member: OrgTeamMember, next: Role) =>
    act(
      () =>
        client.request(`/org/members/${member.userId}/role`, {
          method: 'PUT',
          json: { role: next },
        }),
      `${member.displayName} ahora es ${label(next)}`,
      'No se pudo cambiar el cargo',
    );

  function removeMember(member: OrgTeamMember) {
    if (
      !window.confirm(
        `¿Retirar a ${member.displayName} del equipo? Pierde el acceso de inmediato. Su historial se conserva y puedes devolverle el acceso después.`,
      )
    ) {
      return;
    }
    void act(
      () => client.request(`/org/members/${member.userId}`, { method: 'DELETE' }),
      `${member.displayName} ya no tiene acceso`,
      'No se pudo retirar',
    );
  }

  function revokeInvitation(invitation: OrganizationInvitation) {
    if (
      !window.confirm(`¿Retirar la invitación de ${invitation.email}? El enlace deja de servir.`)
    ) {
      return;
    }
    void act(
      () => client.request(`/org/invitations/${invitation.id}`, { method: 'DELETE' }),
      'Invitación retirada',
      'No se pudo retirar la invitación',
    );
  }

  /** Quien gestiona no se toca a sí mismo, ni a firmantes; un administrador no toca propietarios. */
  const canManage = (member: OrgTeamMember) =>
    member.userId !== user?.id &&
    !member.signerRole &&
    (isOwner || !member.roles.includes(Role.Owner));

  const selected = invitationRoleCopy(role);

  return (
    <PageContainer>
      <PageHeader
        title="Miembros del equipo"
        description="Invita a las personas que trabajan contigo y dale a cada una un cargo. Cada cargo ve y hace solo lo suyo."
      />

      {loadError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-6">
            <p className="text-sm text-destructive">No se pudo cargar el equipo.</p>
            <Button variant="outline" onClick={() => void load()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}
      {!team && !loadError && <Skeleton className="h-40 w-full" />}

      {team && seats && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {seats.limit === null
                  ? `${seats.used} ${seats.used === 1 ? 'persona' : 'personas'} en el equipo`
                  : `Puestos usados: ${taken} de ${seats.limit}`}
              </CardTitle>
              <CardDescription>
                {seats.limit === null
                  ? `Tu plan ${seats.planName} no tiene límite de personas por ahora.`
                  : `Tu plan ${seats.planName} permite hasta ${seats.limit} personas.`}{' '}
                {seats.pendingInvitations > 0 &&
                  `Incluye ${seats.pendingInvitations} ${seats.pendingInvitations === 1 ? 'invitación pendiente' : 'invitaciones pendientes'}. `}
                El contador y el revisor fiscal no ocupan puesto.
              </CardDescription>
            </CardHeader>
            {full && (
              <CardContent>
                <p
                  className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
                  role="status"
                >
                  Llegaste al límite de tu plan. Para invitar a alguien más,{' '}
                  <Link to="/organizacion/plan" className="underline underline-offset-4">
                    mejora tu plan
                  </Link>{' '}
                  o retira a alguien del equipo o una invitación pendiente.
                </p>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invitar a una persona</CardTitle>
              <CardDescription>
                Le llega un correo con un enlace personal que sirve una sola vez y vence en 7 días.
                Con él crea su propia contraseña y entra directo a tu organización con el cargo que
                elijas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={invite}>
                <label className="space-y-1 text-sm" htmlFor="member-email">
                  <span>Correo</span>
                  <Input
                    id="member-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="persona@ejemplo.com"
                  />
                </label>
                <label className="space-y-1 text-sm" htmlFor="member-role">
                  <span>Cargo</span>
                  <select
                    id="member-role"
                    className={selectClass}
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                  >
                    {INVITABLE_ORG_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {label(r)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <Button type="submit" disabled={busy || !email || full}>
                    {busy ? 'Enviando…' : 'Invitar'}
                  </Button>
                </div>
              </form>
              <div className="rounded-md bg-muted/50 p-3 text-sm" aria-live="polite">
                <p className="font-medium">
                  {selected.label}: <span className="font-normal">{selected.summary}</span>
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                  {selected.duties.map((duty) => (
                    <li key={duty}>{duty}</li>
                  ))}
                </ul>
              </div>
              {devLink && (
                <p
                  className="break-all rounded-md border p-3 text-xs"
                  data-testid="dev-invite-link"
                >
                  Enlace de prueba (solo en desarrollo local): {devLink}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Equipo actual</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y rounded-md border" aria-label="Equipo actual">
                {team.members.map((member) => (
                  <li
                    key={member.userId}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">
                        {member.displayName}
                        {member.userId === user?.id && (
                          <span className="text-sm font-normal text-muted-foreground"> (tú)</span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {member.signerRole ? (
                        <>
                          <Badge variant="info">{SIGNER_LABEL[member.signerRole]}</Badge>
                          <Link
                            to="/organizacion/firmantes"
                            className="text-xs underline underline-offset-4"
                          >
                            Se gestiona en Firmantes
                          </Link>
                        </>
                      ) : canManage(member) ? (
                        <>
                          <select
                            aria-label={`Cargo de ${member.displayName}`}
                            className={`${selectClass} w-auto`}
                            value={member.roles[0]}
                            onChange={(e) => void changeRole(member, e.target.value as Role)}
                          >
                            {assignable.map((r) => (
                              <option key={r} value={r}>
                                {label(r)}
                              </option>
                            ))}
                          </select>
                          <Button size="sm" variant="outline" onClick={() => removeMember(member)}>
                            Retirar
                          </Button>
                        </>
                      ) : (
                        member.roles.map((r) => (
                          <Badge key={r} variant={r === Role.Owner ? 'success' : 'secondary'}>
                            {label(r)}
                          </Badge>
                        ))
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {!isOwner && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Solo el propietario puede cambiar o retirar a otro propietario y dar ese cargo.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invitaciones pendientes</CardTitle>
            </CardHeader>
            <CardContent>
              {invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay invitaciones pendientes.</p>
              ) : (
                <ul className="divide-y rounded-md border" aria-label="Invitaciones pendientes">
                  {invitations.map((invitation) => (
                    <li
                      key={invitation.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{invitation.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {label(invitation.role)} · vence el{' '}
                          {DATE_CO.format(new Date(invitation.expiresAt))}
                        </div>
                      </div>
                      {(isOwner || invitation.role !== Role.Owner) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => revokeInvitation(invitation)}
                        >
                          Retirar invitación
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                ¿No le llegó? Invítala de nuevo con el mismo correo: el enlace anterior deja de
                servir y no ocupa un puesto extra.
              </p>
            </CardContent>
          </Card>

          {team.formerMembers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Personas sin acceso</CardTitle>
                <CardDescription>
                  Las retiraste del equipo. Su cuenta y su historial se conservan; si vuelven, dales
                  un cargo (ocupa un puesto del plan).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y rounded-md border" aria-label="Personas sin acceso">
                  {team.formerMembers.map((member) => (
                    <li
                      key={member.userId}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{member.displayName}</div>
                        <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Nuevo cargo de ${member.displayName}`}
                          className={`${selectClass} w-auto`}
                          value={restoreRole[member.userId] ?? Role.Operator}
                          onChange={(e) =>
                            setRestoreRole((current) => ({
                              ...current,
                              [member.userId]: e.target.value as Role,
                            }))
                          }
                        >
                          {assignable.map((r) => (
                            <option key={r} value={r}>
                              {label(r)}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={full}
                          onClick={() =>
                            void changeRole(member, restoreRole[member.userId] ?? Role.Operator)
                          }
                        >
                          Devolver acceso
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <RoleGuide />
        </div>
      )}
    </PageContainer>
  );
}
