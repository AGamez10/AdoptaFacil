import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DocumentType,
  FORMALIZATION_SEQUENCE,
  FormalizationState,
  Role,
  type DocumentReviewClaim,
  type DocumentVerificationReport,
  type DocumentReviewDecision,
  type DocumentReviewQueueItem,
  type OrganizationDocument,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { ApiError, useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { TextField } from '../components/profile-fields';
import { DocumentVerificationPanel } from '../components/document-verification-panel';
import { STATE_NAMES } from '../components/legal-labels';
import styles from './platform-documents-review-page.module.scss';

const TYPE_LABELS: Record<string, string> = {
  [DocumentType.ExistenceRepresentationCertificate]: 'Certificado de existencia y representación',
  [DocumentType.Rut]: 'RUT',
  [DocumentType.LegalRepresentativeId]: 'Documento del representante legal',
  [DocumentType.Other]: 'Otro',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  under_review: 'En revisión',
};

/** Documentos que suben el nivel de verificación del portal (ver
 *  `apps/api/src/modules/org/verification.ts`). Sirve para decir qué le falta
 *  a la organización, no para decidir por el revisor. */
const KEY_DOCUMENTS: DocumentType[] = [
  DocumentType.Rut,
  DocumentType.ExistenceRepresentationCertificate,
];

const DAY_MS = 24 * 60 * 60 * 1000;

function formatCO(iso?: string): string {
  return iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—';
}

function formatTimeCO(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function waitingLabel(iso: string, now: number): string {
  const days = Math.floor((now - new Date(iso).getTime()) / DAY_MS);
  if (days <= 0) return 'Llegó hoy';
  return days === 1 ? 'Espera hace 1 día' : `Espera hace ${days} días`;
}

export interface ReviewGroup {
  organizationId: string;
  organizationName: string;
  documents: DocumentReviewQueueItem[];
  /** El documento más antiguo de la organización (ISO UTC): ordena la cola. */
  oldest: string;
  /** Documentos clave que la organización no tiene en esta cola. */
  missingKeyDocuments: DocumentType[];
}

/** Agrupa la cola plana por organización, la más antigua primero (la que más
 *  ha esperado se atiende antes). */
export function groupQueue(items: readonly DocumentReviewQueueItem[]): ReviewGroup[] {
  const groups = new Map<string, ReviewGroup>();
  for (const item of items) {
    const group = groups.get(item.organizationId) ?? {
      organizationId: item.organizationId,
      organizationName: item.organizationName,
      documents: [],
      oldest: item.createdAt,
      missingKeyDocuments: [],
    };
    group.documents.push(item);
    if (item.createdAt < group.oldest) group.oldest = item.createdAt;
    groups.set(item.organizationId, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      documents: [...group.documents].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      missingKeyDocuments: KEY_DOCUMENTS.filter(
        (type) => !group.documents.some((doc) => doc.type === type),
      ),
    }))
    .sort((a, b) => a.oldest.localeCompare(b.oldest));
}

type ClaimState = 'free' | 'mine' | 'other';

/** Documento aprobado que respalda subir a la organización de estado formal. */
interface PromotionCandidate {
  documentId: string;
  type: DocumentType;
  target: FormalizationState;
}

interface OrgPromotion {
  organizationName: string;
  currentState: FormalizationState;
  candidates: PromotionCandidate[];
}

/** Qué documento acepta la plataforma como evidencia para cada estado (igual
 *  que `PLATFORM_TRANSITION_EVIDENCE` en la API). */
const EVIDENCE_FOR: Partial<Record<FormalizationState, DocumentType>> = {
  [FormalizationState.ESAL]: DocumentType.ExistenceRepresentationCertificate,
  [FormalizationState.ESAL_RTE]: DocumentType.Rut,
};

export interface PromotionStep {
  target: FormalizationState;
  /** Documento citado como evidencia (solo ESAL y ESAL con RTE). */
  documentId?: string;
}

/**
 * Los pasos que la plataforma puede dar seguidos con los documentos que acaba
 * de aprobar: hasta Formalizada basta tener aprobados el RUT y el certificado
 * de Cámara (la API lo vuelve a exigir); ESAL y ESAL con RTE citan el documento
 * que los prueba. Se detiene en el primer paso sin respaldo.
 */
export function promotionPath(promotion: OrgPromotion): PromotionStep[] {
  const rank = (state: FormalizationState) => FORMALIZATION_SEQUENCE.indexOf(state);
  const approvedTypes = new Set(promotion.candidates.map((c) => c.type));
  const hasBoth =
    approvedTypes.has(DocumentType.Rut) &&
    approvedTypes.has(DocumentType.ExistenceRepresentationCertificate);
  const steps: PromotionStep[] = [];
  for (let i = rank(promotion.currentState) + 1; i < FORMALIZATION_SEQUENCE.length; i += 1) {
    const target = FORMALIZATION_SEQUENCE[i]!;
    const evidenceType = EVIDENCE_FOR[target];
    if (!evidenceType) {
      if (!hasBoth) break;
      steps.push({ target });
      continue;
    }
    const candidate = promotion.candidates.find(
      (c) => c.type === evidenceType && rank(c.target) >= i,
    );
    if (!candidate) break;
    steps.push({ target, documentId: candidate.documentId });
  }
  return steps;
}

/**
 * `/plataforma/documentos` — workspace de revisión de plataforma (RF03; Ola 3,
 * R3-6). La cola llega agrupada por organización (la que más ha esperado
 * primero), cada expediente dice qué trae, qué le falta y el siguiente paso, y
 * un revisor lo **reserva** antes de decidir para que dos personas no trabajen
 * el mismo a la vez (la reserva vence sola a los 30 minutos). El revisor puede
 * abrir el archivo antes de decidir. Observar y rechazar exigen motivo. Solo
 * PlatformAdmin/PlatformSuperAdmin.
 */
export function PlatformDocumentsReviewPage() {
  const client = useApiClient();
  const { hasRole, user } = useSession();
  const canReview = hasRole(Role.PlatformAdmin) || hasRole(Role.PlatformSuperAdmin);
  const isSuperAdmin = hasRole(Role.PlatformSuperAdmin);
  const { toast } = useToast();

  const [queue, setQueue] = useState<DocumentReviewQueueItem[]>([]);
  const [claims, setClaims] = useState<DocumentReviewClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<Record<string, OrgPromotion>>({});

  const fetchAll = useCallback(async () => {
    const [items, current] = await Promise.all([
      client.request<DocumentReviewQueueItem[]>('/platform/documents/queue'),
      // Las reservas son una ayuda de coordinación: si fallan, la cola sigue.
      client.request<DocumentReviewClaim[]>('/platform/review-claims').catch(() => []),
    ]);
    return { items: items ?? [], current: current ?? [] };
  }, [client]);

  const reload = useCallback(async () => {
    const { items, current } = await fetchAll();
    setQueue(items);
    setClaims(current);
  }, [fetchAll]);

  useEffect(() => {
    if (!canReview) return;
    let active = true;
    void (async () => {
      try {
        const { items, current } = await fetchAll();
        if (!active) return;
        setQueue(items);
        setClaims(current);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [canReview, fetchAll]);

  const groups = useMemo(() => groupQueue(queue), [queue]);
  const claimByOrg = useMemo(
    () => new Map(claims.map((claim) => [claim.organizationId, claim])),
    [claims],
  );
  const now = Date.now();

  const claimStateOf = (organizationId: string): ClaimState => {
    const claim = claimByOrg.get(organizationId);
    if (!claim || new Date(claim.expiresAt).getTime() <= now) return 'free';
    return claim.reviewerUserId === user?.id ? 'mine' : 'other';
  };

  const takeClaim = async (organizationId: string): Promise<void> => {
    setBusy(organizationId);
    try {
      const claim = await client.request<DocumentReviewClaim>(
        `/platform/review-claims/${organizationId}`,
        { method: 'PUT' },
      );
      setClaims((prev) => [...prev.filter((c) => c.organizationId !== organizationId), claim]);
    } catch (error) {
      if (ApiError.is(error) && error.status === 409) {
        await reload().catch(() => undefined);
        toast({
          title: 'Otra persona ya lo está revisando',
          description: error.message,
          variant: 'warning',
        });
      } else {
        toast({
          title: 'No se pudo reservar el expediente',
          description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
          variant: 'destructive',
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const releaseClaim = async (organizationId: string): Promise<void> => {
    setBusy(organizationId);
    try {
      await client.request<void>(`/platform/review-claims/${organizationId}`, {
        method: 'DELETE',
      });
    } catch {
      // Si ya venció o la liberó otra persona, el resultado es el mismo.
    } finally {
      setClaims((prev) => prev.filter((c) => c.organizationId !== organizationId));
      setBusy(null);
    }
  };

  const viewDocument = async (item: DocumentReviewQueueItem): Promise<void> => {
    // Se abre la pestaña dentro del clic (los navegadores bloquean las que se
    // abren después de una espera) y se le pone el archivo cuando llega.
    const tab = window.open('', '_blank');
    try {
      const blob = await client.requestBlob(
        `/storage/private?key=${encodeURIComponent(item.storageRef)}`,
      );
      const url = URL.createObjectURL(blob);
      if (tab) {
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      toast({
        title: 'No se pudo abrir el documento',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const review = async (
    item: DocumentReviewQueueItem,
    decision: DocumentReviewDecision,
    noteOverride?: string,
  ): Promise<boolean> => {
    const note = (noteOverride ?? notes[item.id])?.trim();
    if ((decision === 'observe' || decision === 'reject') && !note) {
      toast({
        title: 'Motivo requerido',
        description: 'Escribe qué debe corregir la organización.',
        variant: 'warning',
      });
      return false;
    }
    setBusy(item.id);
    try {
      await client.request<OrganizationDocument>(`/platform/documents/${item.id}/decision`, {
        method: 'POST',
        json: { decision, ...(note ? { note } : {}) },
      });
      await reload();
      toast({ title: 'Decisión registrada' });
      return true;
    } catch (error) {
      toast({
        title: 'No se pudo registrar la decisión',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setBusy(null);
    }
  };

  /** Aprobar en un clic desde la lectura automática y, si el documento respalda
   *  un estado superior, dejar lista la oferta de subir a la organización. */
  const approveVerified = async (
    item: DocumentReviewQueueItem,
    report: DocumentVerificationReport,
  ): Promise<void> => {
    const ok = await review(item, 'approve');
    if (!ok || !report.currentState) return;
    const candidate: PromotionCandidate = {
      documentId: item.id,
      type: item.type,
      // Sin estado sugerido el documento igual cuenta como aprobado para
      // Formalizada, pero no respalda ESAL ni RTE.
      target: report.suggestedState ?? report.currentState,
    };
    setPromotions((prev) => {
      const current = prev[item.organizationId];
      return {
        ...prev,
        [item.organizationId]: {
          organizationName: item.organizationName,
          currentState: current?.currentState ?? report.currentState!,
          candidates: [...(current?.candidates ?? []), candidate],
        },
      };
    });
  };

  /** Sube la organización paso a paso hasta donde la respaldan sus documentos.
   *  Cada paso es una transición auditada de la API; se detiene en el primer error. */
  const promote = async (organizationId: string): Promise<void> => {
    const promotion = promotions[organizationId];
    const steps = promotion ? promotionPath(promotion) : [];
    if (!promotion || steps.length === 0) return;
    setBusy(`promote-${organizationId}`);
    let reached = promotion.currentState;
    try {
      for (const step of steps) {
        await client.request(
          `/platform/organizations/${organizationId}/formalization/transitions`,
          {
            method: 'POST',
            json: {
              targetState: step.target,
              ...(step.documentId ? { evidenceDocumentId: step.documentId } : {}),
              reason: 'Documentos verificados y aprobados por la plataforma.',
            },
          },
        );
        reached = step.target;
      }
      toast({
        title: `${promotion.organizationName} ahora es ${STATE_NAMES[reached]}`,
        description: 'Ya tiene habilitadas las funciones de ese estado.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title:
          reached === promotion.currentState
            ? 'No se pudo subir de estado'
            : `Quedó en ${STATE_NAMES[reached]}`,
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setPromotions((prev) => ({
        ...prev,
        [organizationId]: { ...promotion, currentState: reached },
      }));
      setBusy(null);
    }
  };

  const promotionOffers = Object.entries(promotions)
    .map(([organizationId, promotion]) => ({
      organizationId,
      promotion,
      steps: promotionPath(promotion),
    }))
    .filter((offer) => offer.steps.length > 0);

  if (!canReview) {
    return (
      <PageContainer>
        <PageHeader title="Revisión de documentos" description="Acceso restringido." />
        <EmptyState title="Sin acceso" description="No tienes permisos de plataforma." />
      </PageContainer>
    );
  }

  const mineCount = groups.filter((g) => claimStateOf(g.organizationId) === 'mine').length;
  const freeCount = groups.filter((g) => claimStateOf(g.organizationId) === 'free').length;

  return (
    <PageContainer>
      <PageHeader
        title="Revisión de documentos"
        description="Expedientes de las organizaciones, el que más ha esperado primero. Reserva uno antes de decidir para no cruzarte con otra persona del equipo."
      />
      {promotionOffers.length > 0 && (
        <ul className={styles.promotions} aria-label="Organizaciones listas para subir de estado">
          {promotionOffers.map(({ organizationId, promotion, steps }) => (
            <li key={organizationId} className={styles.promotion}>
              <p>
                <strong>{promotion.organizationName}</strong>: los documentos que aprobaste
                respaldan pasar de {STATE_NAMES[promotion.currentState]} a{' '}
                {STATE_NAMES[steps[steps.length - 1]!.target]}.
              </p>
              <Button
                size="sm"
                disabled={busy === `promote-${organizationId}`}
                onClick={() => void promote(organizationId)}
              >
                Subir a {STATE_NAMES[steps[steps.length - 1]!.target]}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && failed && (
        <EmptyState
          title="No pudimos cargar la cola."
          description="Revisa tu conexión y vuelve a intentarlo."
        />
      )}
      {!loading && !failed && groups.length === 0 && (
        <EmptyState
          title="No hay documentos por revisar."
          description="Cuando una organización suba un documento aparecerá aquí."
        />
      )}
      {!loading && !failed && groups.length > 0 && (
        <>
          <ul className={styles.summary} aria-label="Resumen de la cola">
            <li>
              <strong>{groups.length}</strong>{' '}
              {groups.length === 1 ? 'organización espera' : 'organizaciones esperan'}
            </li>
            <li>
              <strong>{queue.length}</strong> {queue.length === 1 ? 'documento' : 'documentos'}
            </li>
            <li>
              <strong>{freeCount}</strong> sin reservar
            </li>
            <li>
              <strong>{mineCount}</strong> reservados por ti
            </li>
          </ul>

          <div className={styles.queue}>
            {groups.map((group) => {
              const state = claimStateOf(group.organizationId);
              const claim = claimByOrg.get(group.organizationId);
              const headingId = `review-org-${group.organizationId}`;
              return (
                <Card
                  key={group.organizationId}
                  className={styles.group}
                  data-claim={state}
                  data-testid="review-group"
                >
                  <section aria-labelledby={headingId}>
                    <CardHeader className={styles.group__header}>
                      <div>
                        <CardTitle id={headingId} className="text-lg">
                          {group.organizationName}
                        </CardTitle>
                        <p className={styles.group__meta}>
                          {waitingLabel(group.oldest, now)} · {group.documents.length}{' '}
                          {group.documents.length === 1
                            ? 'documento por revisar'
                            : 'documentos por revisar'}
                        </p>
                      </div>
                      <div className={styles.group__claim}>
                        {state === 'free' && (
                          <Button
                            size="sm"
                            disabled={busy === group.organizationId}
                            onClick={() => void takeClaim(group.organizationId)}
                          >
                            Reservar expediente
                          </Button>
                        )}
                        {state === 'mine' && claim && (
                          <>
                            <Badge variant="secondary">
                              Lo revisas tú · hasta las {formatTimeCO(claim.expiresAt)}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy === group.organizationId}
                              onClick={() => void releaseClaim(group.organizationId)}
                            >
                              Liberar
                            </Button>
                          </>
                        )}
                        {state === 'other' && claim && (
                          <>
                            <Badge variant="outline">Lo revisa {claim.reviewerEmail}</Badge>
                            {isSuperAdmin && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy === group.organizationId}
                                onClick={() => void releaseClaim(group.organizationId)}
                              >
                                Liberar reserva
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <p className={styles.group__next} data-testid="review-next-step">
                        <span>Siguiente paso:</span>{' '}
                        {state === 'free' &&
                          'reserva el expediente para revisar sus documentos sin cruzarte con nadie.'}
                        {state === 'mine' &&
                          'abre cada documento, compáralo con los datos de la organización y decide.'}
                        {state === 'other' &&
                          'otra persona lo está revisando; puedes seguir con el siguiente expediente.'}
                      </p>

                      {group.missingKeyDocuments.length > 0 && (
                        <p className={styles.group__missing}>
                          Aún no envía:{' '}
                          {group.missingKeyDocuments.map((type) => TYPE_LABELS[type]).join(' y ')}.
                          Puede que ya esté aprobado o que todavía no lo tenga.
                        </p>
                      )}

                      <ul className={styles.docs}>
                        {group.documents.map((item) => {
                          const canDecide = state === 'mine';
                          const label = TYPE_LABELS[item.type] ?? item.type;
                          return (
                            <li key={item.id} className={styles.doc}>
                              <div className={styles.doc__head}>
                                <div>
                                  <p className={styles.doc__title}>
                                    {label} <span>v{item.version}</span>
                                  </p>
                                  <p className={styles.doc__meta}>
                                    Subido: {formatCO(item.createdAt)}
                                    {item.expiresAt && <> · Vence: {formatCO(item.expiresAt)}</>}
                                  </p>
                                </div>
                                <div className={styles.doc__tools}>
                                  <Badge variant="secondary">
                                    {STATUS_LABELS[item.status] ?? item.status}
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void viewDocument(item)}
                                    aria-label={`Ver documento: ${label} de ${group.organizationName}`}
                                  >
                                    Ver documento
                                  </Button>
                                </div>
                              </div>

                              {canDecide && (
                                <DocumentVerificationPanel
                                  documentId={item.id}
                                  busy={busy === item.id}
                                  onApprove={(report) => void approveVerified(item, report)}
                                  onObserve={(note) => {
                                    setNotes((prev) => ({ ...prev, [item.id]: note }));
                                    void review(item, 'observe', note);
                                  }}
                                />
                              )}

                              {canDecide && (
                                <div className={styles.doc__decision}>
                                  <TextField
                                    id={`note-${item.id}`}
                                    label="Motivo para la organización (requerido para observar o rechazar)"
                                    value={notes[item.id] ?? ''}
                                    onChange={(value) =>
                                      setNotes((prev) => ({ ...prev, [item.id]: value }))
                                    }
                                  />
                                  <div className={styles.doc__actions}>
                                    <Button
                                      disabled={busy === item.id}
                                      onClick={() => void review(item, 'approve')}
                                    >
                                      Aprobar
                                    </Button>
                                    <Button
                                      variant="outline"
                                      disabled={busy === item.id}
                                      onClick={() => void review(item, 'observe')}
                                    >
                                      Observar
                                    </Button>
                                    <Button
                                      variant="outline"
                                      disabled={busy === item.id}
                                      onClick={() => void review(item, 'reject')}
                                    >
                                      Rechazar
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </CardContent>
                  </section>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </PageContainer>
  );
}
