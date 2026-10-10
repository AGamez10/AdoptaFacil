// Platform workspace (F19, Anexo #3) + security of platform staff accounts.
//
// The platform team (PlatformAdmin / PlatformSuperAdmin, document-base names)
// works in a TEAM: the organization (tenant) where its members hold their
// platform roles. Everything the team produces while operating (tasks, notes,
// approvals, staff list, activity trail, exports) is tenant data of that team,
// protected by RLS like any business table — so two teams never see or change
// each other's work. The platform catalog itself (organizations under review)
// stays shared by role, as before.
//
// Security controls carried by this contract:
//   - MFA (TOTP, RFC 6238) mandatory for every platform session;
//   - short staff sessions (short access token, MFA valid for a work day,
//     idle timeout on refresh);
//   - four-eyes approval (another PlatformSuperAdmin of the SAME team, with a
//     fresh TOTP code) for sensitive actions;
//   - every platform request recorded in the team's append-only audit trail.
// All timestamps are ISO-8601 UTC; the UI renders them in Colombia time.

import type { AuditEvent } from './audit';
import type { Role } from './auth';

// ============================================================================
// MFA (TOTP)
// ============================================================================

/** 403 body `code` when a platform role is used by an account without MFA. */
export const MFA_ENROLLMENT_REQUIRED = 'MFA_ENROLLMENT_REQUIRED';
/** 403 body `code` when the account has MFA but this session has not passed it
 *  (or it expired: see {@link PlatformSessionPolicy.mfaSessionMaxSeconds}). */
export const MFA_REQUIRED = 'MFA_REQUIRED';

/** `GET /auth/mfa/status` — what the second factor looks like for the caller. */
export interface MfaStatus {
  /** True when the caller holds a platform role and enforcement is on. */
  required: boolean;
  /** A confirmed TOTP factor exists for the account. */
  enrolled: boolean;
  /** The CURRENT session passed the second factor and it is still valid. */
  verified: boolean;
  /** When the current session's second factor stops being valid (UTC), or null. */
  verifiedUntil: string | null;
}

/** `POST /auth/mfa/enroll` — a NEW, not yet confirmed factor. The secret is
 *  shown once so the person can type it by hand if the QR cannot be scanned;
 *  it is stored encrypted and never returned again. */
export interface MfaEnrollment {
  /** Base32 secret (manual entry). */
  secret: string;
  /** `otpauth://totp/...` URI (what the QR encodes). */
  otpauthUri: string;
  /** PNG data URL of the QR, rendered server-side. */
  qrDataUrl: string;
}

/** Body of `POST /auth/mfa/enroll/confirm` and `POST /auth/mfa/verify`: the
 *  6-digit code from the authenticator app. */
export interface MfaCodeInput {
  code: string;
}

// ============================================================================
// Session policy (shown to staff so the rules are never a surprise)
// ============================================================================

export interface PlatformSessionPolicy {
  /** Lifetime of a staff access token. */
  accessTtlSeconds: number;
  /** How long a passed second factor stays valid (one work day). */
  mfaSessionMaxSeconds: number;
  /** A staff session with no refresh for this long must pass MFA again. */
  idleTimeoutSeconds: number;
  /** A sensitive-action request expires if nobody decides it in this time. */
  sensitiveActionTtlSeconds: number;
}

// ============================================================================
// Workspace: who am I in which team
// ============================================================================

/** `GET /platform/workspace/me`. */
export interface WorkspaceMe {
  userId: string;
  email: string;
  displayName: string;
  /** The team = the organization where the caller holds platform roles. */
  teamOrganizationId: string;
  teamName: string;
  /** Platform roles the caller holds in the team. */
  roles: Role[];
  mfa: MfaStatus;
  policy: PlatformSessionPolicy;
}

/** `GET /platform/workspace/team` — the team's staff (platform roles only). */
export interface WorkspaceTeamMember {
  userId: string;
  email: string;
  displayName: string;
  roles: Role[];
  mfaEnrolled: boolean;
  /** ISO-8601 UTC. */
  joinedAt: string;
}

// ============================================================================
// Tasks ("tickets") — organizations pending review, taken by one person
// ============================================================================

export const WORKSPACE_TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_org',
  'resolved',
] as const;
export type WorkspaceTicketStatus = (typeof WORKSPACE_TICKET_STATUSES)[number];

export type WorkspaceTicketEventType =
  'created' | 'assigned' | 'released' | 'status_changed' | 'note' | 'reopened';

/** One immutable entry of a task's history. The task's current state is
 *  always the state carried by its LAST event (highest `seq`). */
export interface WorkspaceTicketEvent {
  id: string;
  seq: number;
  type: WorkspaceTicketEventType;
  status: WorkspaceTicketStatus;
  assigneeUserId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  note: string | null;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Item of `GET /platform/workspace/tickets`. */
export interface WorkspaceTicket {
  id: string;
  kind: 'organization_review';
  subjectOrganizationId: string;
  subjectOrganizationName: string;
  /** Current platform status of the organization (`OrganizationStatus`). */
  subjectOrganizationStatus: string;
  status: WorkspaceTicketStatus;
  assigneeUserId: string | null;
  assigneeEmail: string | null;
  /** Optimistic-concurrency token: the `seq` of the last event. Every change
   *  sends the version it saw; a stale one gets 409 with the current task. */
  version: number;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC (time of the last event). */
  updatedAt: string;
}

/** `GET /platform/workspace/tickets/:id`. */
export interface WorkspaceTicketDetail extends WorkspaceTicket {
  events: WorkspaceTicketEvent[];
}

/** `POST /platform/workspace/tickets/:id/take` and `/release`. */
export interface WorkspaceTicketVersionInput {
  expectedVersion: number;
}

/** `POST /platform/workspace/tickets/:id/status`. */
export interface ChangeWorkspaceTicketStatusInput {
  expectedVersion: number;
  status: WorkspaceTicketStatus;
  note?: string;
}

/** `POST /platform/workspace/tickets/:id/notes`. */
export interface AddWorkspaceTicketNoteInput {
  note: string;
}

/** Max length of a task note. */
export const WORKSPACE_NOTE_MAX_LENGTH = 2000;

// ============================================================================
// Four-eyes approvals for sensitive actions
// ============================================================================

export const SENSITIVE_ACTION_TYPES = [
  'staff.invite',
  'staff.role_grant',
  'staff.role_revoke',
  'staff.mfa_reset',
  'audit.export',
] as const;
export type SensitiveActionType = (typeof SENSITIVE_ACTION_TYPES)[number];

export interface StaffInvitePayload {
  email: string;
  role: Role;
}
export interface StaffRolePayload {
  userId: string;
  role: Role;
}
export interface StaffMfaResetPayload {
  userId: string;
}
export interface AuditExportPayload {
  /** ISO-8601 date (UTC day, inclusive). */
  from: string;
  /** ISO-8601 date (UTC day, inclusive). */
  to: string;
}

export type SensitiveActionPayload =
  StaffInvitePayload | StaffRolePayload | StaffMfaResetPayload | AuditExportPayload;

export type SensitiveActionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';

/** `POST /platform/workspace/approvals`. */
export interface CreateSensitiveActionInput {
  type: SensitiveActionType;
  payload: SensitiveActionPayload;
  /** Why it is needed (mandatory, shown to the approver). */
  reason: string;
}

/** `POST /platform/workspace/approvals/:id/approve|reject` — the approver
 *  re-authenticates with a fresh TOTP code (step-up). */
export interface DecideSensitiveActionInput {
  code: string;
  note?: string;
}

/** Item of `GET /platform/workspace/approvals`. */
export interface SensitiveActionRequest {
  id: string;
  type: SensitiveActionType;
  payload: SensitiveActionPayload;
  reason: string;
  status: SensitiveActionStatus;
  requestedByUserId: string;
  requestedByEmail: string | null;
  /** ISO-8601 UTC. */
  requestedAt: string;
  /** ISO-8601 UTC. */
  expiresAt: string;
  decidedByUserId: string | null;
  decidedByEmail: string | null;
  /** ISO-8601 UTC. */
  decidedAt: string | null;
  decisionNote: string | null;
  /** For an approved `audit.export`: until when the requester can download it. */
  downloadableUntil: string | null;
}

// ============================================================================
// Activity (the team's append-only audit trail)
// ============================================================================

/** Item of `GET /platform/workspace/activity`. */
export interface WorkspaceActivityItem extends AuditEvent {
  actorEmail: string | null;
}
