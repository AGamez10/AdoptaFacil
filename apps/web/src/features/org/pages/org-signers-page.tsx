import { useCallback, useEffect, useState } from 'react';
import {
  Role,
  type AdditionalSignerRole,
  type LegalRepresentativeRole,
  type OrgReportKind,
  type OrgReportPolicy,
  type OrgReportsReadiness,
  type OrgSigner,
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
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';

/**
 * `/organizacion/firmantes` (M13) — la ORGANIZACIÓN vincula y gestiona a las
 * personas que firman con ella (contador, revisor fiscal). Por defecto lo
 * controla el propietario (el representante legal): invita por correo, la
 * persona crea su propia cuenta y contraseña con el enlace (la plataforma
 * nunca las conoce), y el propietario puede revocar ese acceso cuando quiera.
 * También declara qué firmas exigen sus estatutos para cada tipo de reporte.
 *
 * Nada aquí decide permisos: el servidor los exige en cada llamada.
 */

const SEAT_LABEL: Record<LegalRepresentativeRole, string> = {
  legal_representative: 'Representante legal',
  fiscal_reviewer: 'Revisor fiscal',
  accountant: 'Contador',
};

const KIND_LABEL: Record<OrgReportKind, string> = {
  donations: 'Informe de donaciones',
  social_service: 'Reporte de servicio social',
};

const STATUS_UI: Record<
  OrgSigner['status'],
  { label: string; variant: 'success' | 'warning' | 'secondary' }
> = {
  active: { label: 'Vinculado', variant: 'success' },
  invited: { label: 'Invitación enviada', variant: 'warning' },
  revoked: { label: 'Revocado', variant: 'secondary' },
};

const DEFAULT_POLICY: Record<OrgReportKind, LegalRepresentativeRole[]> = {
  donations: ['legal_representative', 'fiscal_reviewer'],
  social_service: ['legal_representative'],
};

function PolicyCard({
  kind,
  policy,
  canEdit,
  onSaved,
}: {
  kind: OrgReportKind;
  policy: OrgReportPolicy | undefined;
  canEdit: boolean;
  onSaved: (policy: OrgReportPolicy) => void;
}) {
  const client = useApiClient();
  const { toast } = useToast();
  const [roles, setRoles] = useState<LegalRepresentativeRole[]>(
    policy?.requiredRoles ?? DEFAULT_POLICY[kind],
  );
  const [saving, setSaving] = useState(false);

  function toggle(role: LegalRepresentativeRole) {
    setRoles((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
    );
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await client.request<OrgReportPolicy>('/org/reports/policy', {
        method: 'PUT',
        json: { kind, requiredRoles: roles },
      });
      onSaved(saved);
      toast({ title: 'Firmas exigidas guardadas', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{KIND_LABEL[kind]}</legend>
      {(Object.keys(SEAT_LABEL) as LegalRepresentativeRole[]).map((role) => (
        <label key={role} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={roles.includes(role)}
            // El representante legal siempre firma.
            disabled={!canEdit || role === 'legal_representative'}
            onChange={() => toggle(role)}
          />
          {SEAT_LABEL[role]}
        </label>
      ))}
      {canEdit && (
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      )}
    </fieldset>
  );
}

export function OrgSignersPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const { toast } = useToast();
  const isOwner = hasRole(Role.Owner);

  const [signers, setSigners] = useState<OrgSigner[] | null>(null);
  const [policies, setPolicies] = useState<OrgReportPolicy[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState('');
  const [seat, setSeat] = useState<AdditionalSignerRole>('fiscal_reviewer');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [list, ready] = await Promise.all([
        client.request<OrgSigner[]>('/org/signers'),
        client.request<OrgReportsReadiness>('/org/reports/readiness'),
      ]);
      setSigners(list);
      setPolicies(ready.policies ?? []);
    } catch {
      setLoadError(true);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await client.request('/org/invitations', {
        method: 'POST',
        json: { email: email.trim(), role: Role.ReadOnlyAuditor, signerRole: seat },
      });
      toast({
        title: 'Invitación enviada',
        description: 'La persona crea su propia cuenta y contraseña con el enlace del correo.',
        variant: 'success',
      });
      setEmail('');
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo invitar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(signer: OrgSigner) {
    if (!window.confirm(`¿Revocar el acceso de ${signer.displayName ?? signer.email}?`)) return;
    try {
      await client.request(`/org/signers/${signer.id}`, { method: 'DELETE' });
      toast({ title: 'Acceso revocado', variant: 'success' });
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo revocar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Firmantes"
        description="Las personas que firman contigo (contador, revisor fiscal). Tú las vinculas y tú las revocas: ellas crean su propia cuenta y contraseña."
      />

      {loadError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-6">
            <p className="text-sm text-destructive">No se pudieron cargar los firmantes.</p>
            <Button variant="outline" onClick={() => void load()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}
      {!signers && !loadError && <Skeleton className="h-40 w-full" />}

      {signers && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quién firma</CardTitle>
              <CardDescription>
                El representante legal firma con la cuenta principal al generar el documento. El
                contador y el revisor fiscal reciben un correo y autorizan cada documento con su
                propia cuenta: nadie firma por otro.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="divide-y rounded-md border" aria-label="Firmantes">
                {signers.length === 0 && (
                  <li className="p-3 text-sm text-muted-foreground">
                    Aún no has vinculado a nadie. El representante legal firma con la cuenta de la
                    organización.
                  </li>
                )}
                {signers.map((signer) => (
                  <li
                    key={`${signer.status}-${signer.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 p-3"
                  >
                    <div>
                      <div className="font-medium">
                        {signer.displayName ?? signer.email}{' '}
                        <span className="text-sm font-normal text-muted-foreground">
                          · {SEAT_LABEL[signer.role]}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">{signer.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_UI[signer.status].variant}>
                        {STATUS_UI[signer.status].label}
                      </Badge>
                      {isOwner && signer.status !== 'revoked' && (
                        <Button size="sm" variant="outline" onClick={() => void revoke(signer)}>
                          {signer.status === 'invited' ? 'Retirar invitación' : 'Revocar'}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {isOwner ? (
                <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={invite}>
                  <label className="space-y-1 text-sm" htmlFor="signer-email">
                    <span>Correo de la persona</span>
                    <Input
                      id="signer-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contador@ejemplo.com"
                    />
                  </label>
                  <label className="space-y-1 text-sm" htmlFor="signer-seat">
                    <span>Cargo</span>
                    <select
                      id="signer-seat"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={seat}
                      onChange={(e) => setSeat(e.target.value as AdditionalSignerRole)}
                    >
                      <option value="fiscal_reviewer">Revisor fiscal</option>
                      <option value="accountant">Contador</option>
                    </select>
                  </label>
                  <div className="flex items-end">
                    <Button type="submit" disabled={busy || !email}>
                      {busy ? 'Enviando…' : 'Invitar'}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Solo el propietario de la organización vincula o revoca firmantes.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Firmas que exigen tus estatutos</CardTitle>
              <CardDescription>
                Tú declaras qué firmas lleva cada documento; AdoptaFácil aplica la regla pero no
                interpreta tus estatutos. El representante legal siempre firma.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {(['donations', 'social_service'] as const).map((kind) => (
                <PolicyCard
                  key={`${kind}-${policies.find((p) => p.kind === kind)?.requiredRoles.join()}`}
                  kind={kind}
                  policy={policies.find((p) => p.kind === kind)}
                  canEdit={isOwner}
                  onSaved={(saved) =>
                    setPolicies((current) => [...current.filter((p) => p.kind !== kind), saved])
                  }
                />
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
