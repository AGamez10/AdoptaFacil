import {
  FOLLOWUP_VIDEO_CONTENT_TYPES,
  FOLLOWUP_VIDEO_DEFAULT_MAX_MB,
  FOLLOWUP_VIDEO_MAX_SECONDS,
  type AdoptionFollowUpMilestone,
  type FollowUpMilestoneStatus,
} from '@adoptafacil/contracts';

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

/** Videos accepted as follow-up evidence (same as the API): what phone cameras record. */
export const FOLLOWUP_VIDEO_ACCEPT = FOLLOWUP_VIDEO_CONTENT_TYPES;

/** Everything the evidence field accepts: photos and short videos. */
export const FOLLOWUP_MEDIA_ACCEPT = [...FOLLOWUP_PHOTO_ACCEPT, ...FOLLOWUP_VIDEO_ACCEPT] as const;

export function isFollowUpVideo(file: File): boolean {
  return (FOLLOWUP_VIDEO_ACCEPT as readonly string[]).includes(file.type);
}

/**
 * Plain-language validation of a follow-up photo or video (type and size);
 * `null` when it is valid. The video length is checked apart
 * ({@link readVideoDuration}) and, for real, by the API.
 */
export function validateFollowUpMedia(file: File): string | null {
  if (isFollowUpVideo(file)) {
    return file.size > FOLLOWUP_VIDEO_DEFAULT_MAX_MB * 1024 * 1024
      ? `El video pesa demasiado. El máximo es ${FOLLOWUP_VIDEO_DEFAULT_MAX_MB} MB.`
      : null;
  }
  if (!(FOLLOWUP_PHOTO_ACCEPT as readonly string[]).includes(file.type)) {
    return 'Ese archivo no es válido. Sube una foto JPG, PNG o WebP, o un video MP4 o MOV.';
  }
  return validateFollowUpPhoto(file);
}

/** Message when a video is longer than allowed; `null` when it fits. */
export function videoDurationError(seconds: number | null): string | null {
  if (seconds === null || seconds <= FOLLOWUP_VIDEO_MAX_SECONDS + 0.5) return null;
  return `El video dura ${Math.round(seconds)} s. El máximo es ${FOLLOWUP_VIDEO_MAX_SECONDS} s.`;
}

/** Reads a local video's duration in the browser; `null` if it cannot. */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof URL.createObjectURL !== 'function') return resolve(null);
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

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
