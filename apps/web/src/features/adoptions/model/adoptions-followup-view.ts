import type { AdoptionFollowUpMilestone, FollowUpMilestoneStatus } from '@adoptafacil/contracts';

/** Human labels (es-CO) per follow-up milestone status. */
export const FOLLOWUP_STATUS_LABELS: Record<FollowUpMilestoneStatus, string> = {
  scheduled: 'Programado',
  completed: 'Completado',
  overdue: 'Vencido',
};

/** Badge variant per milestone status (semantic). */
export function followUpStatusVariant(
  status: FollowUpMilestoneStatus,
): 'outline' | 'success' | 'destructive' {
  switch (status) {
    case 'scheduled':
      return 'outline';
    case 'completed':
      return 'success';
    case 'overdue':
      return 'destructive';
  }
}

// --- Adopter side ("Mis seguimientos") --------------------------------------

/**
 * Client-side cap for follow-up photos. The API enforces STORAGE_MAX_FILE_MB
 * (default 15); the screen stays a bit stricter so a valid pick is never
 * rejected by the server for size.
 */
export const FOLLOWUP_PHOTO_MAX_MB = 10;

/** Same allowlist as the API (`FOLLOWUP_PHOTO_CONTENT_TYPES`). */
export const FOLLOWUP_PHOTO_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Plain-language validation of a follow-up photo; `null` when it is valid. */
export function validateFollowUpPhoto(file: File): string | null {
  if (!(FOLLOWUP_PHOTO_ACCEPT as readonly string[]).includes(file.type)) {
    return 'Ese archivo no es una foto válida. Sube una imagen JPG, PNG o WebP.';
  }
  if (file.size > FOLLOWUP_PHOTO_MAX_MB * 1024 * 1024) {
    return `La foto pesa demasiado. El máximo es ${FOLLOWUP_PHOTO_MAX_MB} MB.`;
  }
  return null;
}

/** Defensive normalization of `GET /adoptions/followups/mine`. */
export function normalizeMyFollowUps(body: unknown): AdoptionFollowUpMilestone[] {
  return Array.isArray(body) ? body : [];
}

/** Pending milestones first (overdue, then by due date), completed last. */
export function sortMyFollowUps(items: AdoptionFollowUpMilestone[]): AdoptionFollowUpMilestone[] {
  const rank = (m: AdoptionFollowUpMilestone) =>
    m.status === 'overdue' ? 0 : m.status === 'scheduled' ? 1 : 2;
  return [...items].sort((a, b) => rank(a) - rank(b) || a.dueAt.localeCompare(b.dueAt));
}

/** Answers given across every evidence of a milestone (later ones win). */
export function mergedFollowUpAnswers(
  milestone: AdoptionFollowUpMilestone,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const evidence of milestone.evidence ?? []) {
    if (evidence.answers) Object.assign(merged, evidence.answers);
  }
  return merged;
}

/** Human rendering of one stored answer. */
export function formatFollowUpAnswer(value: unknown): string {
  if (value === true) return 'Sí';
  if (value === false) return 'No';
  if (typeof value === 'string' && value.trim()) return value;
  return 'Sin respuesta';
}
