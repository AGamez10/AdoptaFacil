// ============================================================================
// Email templates configurable from the superadmin panel (notifications).
// Additive contract: the platform owns ONE catalog of email events (fixed in
// code, so a template can never invent a new trigger or a new link), and the
// superadmin edits only the COPY of each event (subject, preheader, heading,
// body, button label, footer note). Every edit is a new immutable VERSION; one
// version (or the built-in default) is ACTIVE per event; non-required events can
// be switched off. Template text is PLAIN TEXT with `{{variable}}` placeholders
// (only the variables the catalog lists for that event) and `**bold**`; it is
// never interpreted as HTML. All timestamps are ISO-8601 UTC.
// ============================================================================

/** Every email event the platform can send. Fixed in code (catalog). */
export const EMAIL_EVENT_KEYS = [
  'auth.password_reset',
  'org.invitation',
  'platform.team_invitation',
  'donation.thanks',
  'sponsorship.welcome',
  'sponsorship.charge',
  'sponsorship.reminder',
  'sponsorship.final_reminder',
  'sponsorship.suspended_sponsor',
  'sponsorship.suspended_org',
  'sponsorship.animal_deceased',
  'adoption.status_changed',
  'adoption.followup_overdue',
  'adoption.contract_signed',
  'adoption.delivery_code',
  'volunteering.enrollment_received',
  'volunteering.enrollment_accepted',
  'volunteering.enrollment_rejected',
  'volunteering.hours_approved',
  'volunteering.hours_rejected',
  'volunteering.certificate_issued',
  'community.campaign_update',
  'platform.announcement',
  'org.urgent_announcement',
] as const;

export type EmailEventKey = (typeof EMAIL_EVENT_KEYS)[number];

/**
 * `transactional`: about the recipient's own activity (receipt, status change,
 * security) — always delivered while the event is enabled.
 * `bulk`: sent to many recipients (news, announcements) — carries an
 * unsubscribe link and is NEVER delivered to an address that opted out
 * (Ley 1581 de 2012, revocatoria de la autorización).
 */
export type EmailCategory = 'transactional' | 'bulk';

/** Visual family of the email (accent color + header icon). */
export type EmailTheme =
  | 'security'
  | 'team'
  | 'donation'
  | 'sponsorship'
  | 'adoption'
  | 'volunteering'
  | 'community'
  | 'alert';

export type EmailVariableKind = 'text' | 'money' | 'date' | 'number' | 'url';

export interface EmailVariableDescriptor {
  /** Placeholder name used as `{{name}}` in the template. */
  name: string;
  /** Human label shown in the editor. */
  label: string;
  kind: EmailVariableKind;
  /** Value used in previews and test sends. */
  example: string;
}

/**
 * Accent colors the editor offers for an email (bar, icon bubble and note
 * box). A closed palette from the brand so text and button keep AA contrast;
 * absent = the event's own theme color.
 */
export const EMAIL_ACCENT_COLORS = [
  'teal',
  'navy',
  'coral',
  'gold',
  'blue',
  'red',
  'purple',
  'green',
] as const;
export type EmailAccentColor = (typeof EMAIL_ACCENT_COLORS)[number];

/** Header icons the editor offers; absent = the event's own theme icon. */
export const EMAIL_ICONS = [
  '🐾',
  '🏡',
  '💛',
  '🤝',
  '📣',
  '⏰',
  '🔒',
  '🎉',
  '🩺',
  '📅',
  '⭐',
  '🚨',
] as const;
export type EmailIcon = (typeof EMAIL_ICONS)[number];

/** The editable copy of an email. */
export interface EmailTemplateContent {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  /** Button label; empty/absent = no button. The button's URL is fixed by the catalog. */
  ctaLabel?: string;
  footerNote?: string;
  /** Optional design (additive): accent color and header icon. */
  accentColor?: EmailAccentColor;
  icon?: EmailIcon;
}

export interface EmailTemplateVersion extends EmailTemplateContent {
  version: number;
  changeNote?: string;
  createdByUserId?: string;
  createdAt: string;
}

/** One row of the superadmin's template list. */
export interface EmailTemplateSummary {
  event: EmailEventKey;
  label: string;
  description: string;
  /** Who receives it, in plain words (e.g. "La persona que donó"). */
  audience: string;
  category: EmailCategory;
  theme: EmailTheme;
  /** Required events (e.g. password reset) can never be switched off. */
  required: boolean;
  enabled: boolean;
  /** Active custom version; `null` = the built-in default copy is in use. */
  activeVersion: number | null;
  latestVersion: number | null;
  updatedAt?: string;
}

export interface EmailTemplateDetail extends EmailTemplateSummary {
  variables: EmailVariableDescriptor[];
  /** Name of the URL variable the button links to (fixed), if any. */
  ctaUrlVariable?: string;
  defaultContent: EmailTemplateContent;
  /** The copy in use right now (active version or default). */
  activeContent: EmailTemplateContent;
  /** Newest first. */
  versions: EmailTemplateVersion[];
}

export interface CreateEmailTemplateVersionInput extends EmailTemplateContent {
  changeNote?: string;
  /** Activate the new version right away (default false = saved as draft). */
  activate?: boolean;
}

export interface ActivateEmailTemplateInput {
  /** Version to activate; `null` = go back to the built-in default copy. */
  version: number | null;
}

export interface SetEmailTemplateEnabledInput {
  enabled: boolean;
}

export interface PreviewEmailTemplateInput {
  /** Draft copy to preview; absent = preview the active copy. */
  content?: EmailTemplateContent;
  organizationName?: string;
}

export interface EmailPreview {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export interface SendTestEmailResult {
  /** Masked address the test was sent to (the acting admin's own email). */
  sentTo: string;
}

/** Public, no session — confirm an unsubscribe link from a bulk email. */
export interface EmailUnsubscribeInput {
  h: string;
  t: string;
  /** Additive: present on links of an organization's emails — the opt-out
   *  then applies only to that organization. */
  o?: string;
}

/** Who an organization's urgent announcement goes to (its own contacts). */
export const ANNOUNCEMENT_AUDIENCES = ['donors', 'adopters', 'volunteers'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

/**
 * Announcements an organization may send per rolling 24 h.
 * TODO(client): confirmar el tope; 3 al día evita el abuso sin frenar urgencias.
 */
export const ORG_ANNOUNCEMENT_DAILY_LIMIT = 3;

/** `GET /org/announcements/audience`: distinct reachable addresses per audience
 *  (after opt-outs). `total` counts each address once across audiences. */
export interface OrgAnnouncementAudience {
  donors: number;
  adopters: number;
  volunteers: number;
  total: number;
  /** Announcements still allowed in the current 24 h window. */
  remainingToday: number;
}

/** `POST /org/announcements` (Owner, Administrator). */
export interface SendOrgAnnouncementInput {
  audiences: AnnouncementAudience[];
  title: string;
  message: string;
}

export interface SendOrgAnnouncementResult {
  /** Emails enqueued (opted-out addresses are skipped at delivery). */
  recipients: number;
}

export interface EmailUnsubscribeResult {
  unsubscribed: true;
}
