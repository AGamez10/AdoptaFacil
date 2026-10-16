import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdoptionFollowUpMilestone, FollowUpQuestion } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Skeleton,
  cn,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { listMyFollowUps, submitFollowUp, submitFollowUpWithPhoto } from '../api/adoptions-api';
import { formatBogota } from '../model/adoptions-view';
import {
  FOLLOWUP_PHOTO_ACCEPT,
  FOLLOWUP_PHOTO_MAX_MB,
  FOLLOWUP_STATUS_LABELS,
  followUpStatusVariant,
  formatFollowUpAnswer,
  mergedFollowUpAnswers,
  normalizeMyFollowUps,
  sortMyFollowUps,
  validateFollowUpPhoto,
} from '../model/adoptions-followup-view';

/** Answer stored for a `photo` question once its picture is sent. */
const PHOTO_ANSWER = 'Foto adjunta';

/**
 * "Mis seguimientos" (T-028c, RF12) — el ADOPTANTE responde los hitos de
 * seguimiento post-adopción que la organización programó sobre su contrato
 * firmado (`GET /adoptions/followups/mine`, cross-tenant por identidad). Los
 * hitos programados/vencidos muestran el cuestionario; los completados, la fecha
 * (hora Colombia) y lo respondido. Las fotos viajan por
 * `POST /adoptions/followups/:id/photo` (multipart); sin foto, por `/submit`.
 */
export function MyFollowUpsPage() {
  const client = useApiClient();
  const [milestones, setMilestones] = useState<AdoptionFollowUpMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    listMyFollowUps(client)
      .then((body) => setMilestones(sortMyFollowUps(normalizeMyFollowUps(body))))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageContainer>
      <PageHeader
        title="Mis seguimientos"
        description="Cuéntale a la organización cómo va tu adopción: responde cada seguimiento antes de su fecha límite."
      />
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <ErrorState
          title="No se pudieron cargar tus seguimientos"
          description="Inténtalo de nuevo en unos minutos."
          onRetry={load}
        />
      ) : milestones.length === 0 ? (
        <EmptyState
          title="No tienes seguimientos pendientes"
          description="Cuando adoptes y la organización programe un seguimiento, aparecerá aquí."
        />
      ) : (
        <ul className="space-y-4">
          {milestones.map((milestone) => (
            <li key={milestone.id}>
              <FollowUpCard milestone={milestone} onSubmitted={load} />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

function FollowUpCard({
  milestone,
  onSubmitted,
}: {
  milestone: AdoptionFollowUpMilestone;
  onSubmitted: () => void;
}) {
  const headingId = `followup-${milestone.id}-title`;
  return (
    <Card aria-labelledby={headingId}>
      <CardContent className="space-y-3 pt-6 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={headingId} className="text-base font-semibold">
            {milestone.title}
          </h2>
          <Badge variant={followUpStatusVariant(milestone.status)}>
            {FOLLOWUP_STATUS_LABELS[milestone.status]}
          </Badge>
          <span className="ml-auto text-muted-foreground">
            {milestone.status === 'completed' && milestone.completedAt
              ? `Completado el ${formatBogota(milestone.completedAt)}`
              : `Fecha límite: ${formatBogota(milestone.dueAt)}`}
          </span>
        </div>
        {milestone.status === 'completed' ? (
          <CompletedAnswers milestone={milestone} />
        ) : (
          <>
            {milestone.status === 'overdue' && (
              <p className="text-destructive">
                Este seguimiento ya venció, pero aún puedes responderlo.
              </p>
            )}
            <FollowUpForm milestone={milestone} onSubmitted={onSubmitted} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CompletedAnswers({ milestone }: { milestone: AdoptionFollowUpMilestone }) {
  const answers = mergedFollowUpAnswers(milestone);
  const photos = (milestone.evidence ?? []).filter((e) => e.storageRef || e.photoUrl).length;
  return (
    <div className="space-y-2">
      {milestone.questionnaire.length > 0 && (
        <dl className="space-y-2">
          {milestone.questionnaire.map((question) => (
            <div key={question.id}>
              <dt className="font-medium">{question.prompt}</dt>
              <dd className="text-muted-foreground">
                {formatFollowUpAnswer(answers[question.id])}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {photos > 0 && (
        <p className="text-muted-foreground">
          {photos === 1 ? '1 foto enviada.' : `${photos} fotos enviadas.`}
        </p>
      )}
    </div>
  );
}

const fieldClass = cn(
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
);

/** Photo field key for the optional general photo (questions use their id). */
const GENERAL_PHOTO = '__general__';

function FollowUpForm({
  milestone,
  onSubmitted,
}: {
  milestone: AdoptionFollowUpMilestone;
  onSubmitted: () => void;
}) {
  const client = useApiClient();
  const { toast } = useToast();
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [booleans, setBooleans] = useState<Record<string, boolean>>({});
  const [photos, setPhotos] = useState<Record<string, File>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const idFor = (key: string) => `followup-${milestone.id}-${key}`;

  const pickPhoto = (key: string, file: File | undefined) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (!file) return;
    const invalid = validateFollowUpPhoto(file);
    if (invalid) {
      setErrors((prev) => ({ ...prev, [key]: invalid }));
      return;
    }
    setPhotos((prev) => ({ ...prev, [key]: file }));
  };

  const validate = (): Record<string, string> => {
    const found: Record<string, string> = {};
    for (const question of milestone.questionnaire) {
      if (!question.required) continue;
      const missing =
        (question.kind === 'text' && !(texts[question.id] ?? '').trim()) ||
        (question.kind === 'boolean' && booleans[question.id] === undefined) ||
        (question.kind === 'photo' && !photos[question.id]);
      if (missing) found[question.id] = 'Esta pregunta es obligatoria.';
    }
    if (milestone.questionnaire.length === 0 && !photos[GENERAL_PHOTO]) {
      found[GENERAL_PHOTO] = 'Adjunta al menos una foto para enviar este seguimiento.';
    }
    return found;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    // Keep file-type/size errors already shown on the photo fields.
    const pending = { ...errors, ...found };
    if (Object.keys(pending).length > 0) {
      setErrors(pending);
      toast({
        title: 'Revisa el formulario',
        description: 'Hay preguntas sin responder o archivos no válidos.',
        variant: 'warning',
      });
      return;
    }

    const answers: Record<string, unknown> = {};
    for (const question of milestone.questionnaire) {
      if (question.kind === 'text' && (texts[question.id] ?? '').trim()) {
        answers[question.id] = texts[question.id].trim();
      } else if (question.kind === 'boolean' && booleans[question.id] !== undefined) {
        answers[question.id] = booleans[question.id];
      } else if (question.kind === 'photo' && photos[question.id]) {
        answers[question.id] = PHOTO_ANSWER;
      }
    }
    // The photo endpoint takes one file per call: every photo but the last goes
    // without completing; the last one carries the answers and completes.
    const files = [
      ...milestone.questionnaire.map((q) => photos[q.id]).filter((f): f is File => !!f),
      ...(photos[GENERAL_PHOTO] ? [photos[GENERAL_PHOTO]] : []),
    ];

    setSaving(true);
    try {
      if (files.length === 0) {
        await submitFollowUp(client, milestone.id, { answers, complete: true });
      } else {
        for (const [index, file] of files.entries()) {
          const last = index === files.length - 1;
          await submitFollowUpWithPhoto(client, milestone.id, file, last ? answers : undefined, {
            complete: last,
          });
        }
      }
      toast({
        title: 'Seguimiento enviado',
        description: '¡Gracias por contarnos!',
        variant: 'success',
      });
      onSubmitted();
    } catch (error) {
      toast({
        title: 'No se pudo enviar el seguimiento',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`${idFor(key)}-error`} className="text-destructive" role="alert">
        {errors[key]}
      </p>
    ) : null;

  const renderQuestion = (question: FollowUpQuestion) => {
    const id = idFor(question.id);
    const label = (
      <>
        {question.prompt}
        {question.required && <span aria-hidden> *</span>}
      </>
    );
    const describedBy = errors[question.id] ? `${id}-error` : undefined;

    if (question.kind === 'boolean') {
      return (
        <fieldset key={question.id} className="space-y-1.5" aria-describedby={describedBy}>
          <legend className="font-medium">{label}</legend>
          <div className="flex gap-4">
            {[
              { value: true, text: 'Sí' },
              { value: false, text: 'No' },
            ].map((option) => (
              <label key={option.text} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={id}
                  checked={booleans[question.id] === option.value}
                  onChange={() => setBooleans((prev) => ({ ...prev, [question.id]: option.value }))}
                  required={question.required}
                />
                {option.text}
              </label>
            ))}
          </div>
          {fieldError(question.id)}
        </fieldset>
      );
    }

    if (question.kind === 'photo') {
      return (
        <div key={question.id} className="space-y-1.5">
          <label htmlFor={id} className="block font-medium">
            {label}
          </label>
          <input
            id={id}
            type="file"
            accept={FOLLOWUP_PHOTO_ACCEPT.join(',')}
            aria-describedby={describedBy}
            aria-invalid={!!errors[question.id]}
            onChange={(event) => pickPhoto(question.id, event.target.files?.[0])}
          />
          {fieldError(question.id)}
        </div>
      );
    }

    return (
      <div key={question.id} className="space-y-1.5">
        <label htmlFor={id} className="block font-medium">
          {label}
        </label>
        <textarea
          id={id}
          rows={3}
          value={texts[question.id] ?? ''}
          onChange={(event) => setTexts((prev) => ({ ...prev, [question.id]: event.target.value }))}
          aria-describedby={describedBy}
          aria-invalid={!!errors[question.id]}
          aria-required={question.required}
          className={fieldClass}
        />
        {fieldError(question.id)}
      </div>
    );
  };

  const generalId = idFor(GENERAL_PHOTO);
  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      {milestone.questionnaire.map(renderQuestion)}
      <div className="space-y-1.5">
        <label htmlFor={generalId} className="block font-medium">
          {milestone.questionnaire.length === 0
            ? 'Foto de tu mascota *'
            : 'Foto adicional (opcional)'}
        </label>
        <input
          id={generalId}
          type="file"
          accept={FOLLOWUP_PHOTO_ACCEPT.join(',')}
          aria-describedby={`${generalId}-hint${errors[GENERAL_PHOTO] ? ` ${generalId}-error` : ''}`}
          aria-invalid={!!errors[GENERAL_PHOTO]}
          onChange={(event) => pickPhoto(GENERAL_PHOTO, event.target.files?.[0])}
        />
        <p id={`${generalId}-hint`} className="text-muted-foreground">
          JPG, PNG o WebP, hasta {FOLLOWUP_PHOTO_MAX_MB} MB.
        </p>
        {fieldError(GENERAL_PHOTO)}
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? 'Enviando…' : 'Enviar seguimiento'}
      </Button>
    </form>
  );
}
