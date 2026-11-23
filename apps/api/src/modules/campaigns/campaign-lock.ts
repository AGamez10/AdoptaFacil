import type { UpdateCampaignInput } from '@adoptafacil/contracts';

/** What the lock needs to know about the stored campaign. */
export interface LockedCampaignState {
  title: string;
  description: string | null;
  category: string;
  goalAmount: number;
  deadline: Date;
  status: string;
  raisedAmount: number;
}

/** A field that the PATCH really changes, with its previous and new value. */
export type CampaignChanges = Partial<
  Record<
    'title' | 'description' | 'category' | 'goalAmount' | 'deadline' | 'status',
    { from: string | number | null; to: string | number | null }
  >
>;

const FINAL_STATUSES = new Set(['closed', 'cancelled']);

export function isFinalCampaignStatus(status: string): boolean {
  return FINAL_STATUSES.has(status);
}

/**
 * The fields a PATCH actually changes. The edit form resends every field, so a
 * value equal to the stored one is not a change (and never trips the lock).
 */
export function campaignChanges(
  existing: LockedCampaignState,
  input: UpdateCampaignInput,
): CampaignChanges {
  const changes: CampaignChanges = {};
  if (input.title !== undefined && input.title !== existing.title) {
    changes.title = { from: existing.title, to: input.title };
  }
  if (input.description !== undefined && input.description !== (existing.description ?? '')) {
    // The description is free text: the audit records THAT it changed, not its content.
    changes.description = { from: null, to: null };
  }
  if (input.category !== undefined && input.category !== existing.category) {
    changes.category = { from: existing.category, to: input.category };
  }
  if (input.goalAmount !== undefined && input.goalAmount !== existing.goalAmount) {
    changes.goalAmount = { from: existing.goalAmount, to: input.goalAmount };
  }
  if (
    input.deadline !== undefined &&
    new Date(input.deadline).getTime() !== existing.deadline.getTime()
  ) {
    changes.deadline = { from: existing.deadline.toISOString(), to: input.deadline };
  }
  if (input.status !== undefined && input.status !== existing.status) {
    changes.status = { from: existing.status, to: input.status };
  }
  return changes;
}

/**
 * Why a change is not allowed (Spanish, shown to the user), or null.
 *   - A closed or cancelled campaign is final: nothing changes, it is never reopened.
 *   - Once it received money, the goal cannot go down and the category cannot
 *     change (donors gave for THAT goal and THAT purpose). Raising the goal or
 *     extending the deadline stays allowed, and is audited.
 * The database enforces the same rules (trigger `campaigns_lock`).
 */
export function campaignLockProblem(
  existing: LockedCampaignState,
  changes: CampaignChanges,
): string | null {
  if (Object.keys(changes).length === 0) return null;
  if (isFinalCampaignStatus(existing.status)) {
    return existing.status === 'closed'
      ? 'Esta campaña ya finalizó: no se puede reabrir ni modificar. Si necesitas recaudar más, crea una campaña nueva.'
      : 'Esta campaña fue cancelada: no se puede reabrir ni modificar. Si necesitas recaudar, crea una campaña nueva.';
  }
  if (existing.raisedAmount > 0) {
    const goal = changes.goalAmount;
    if (goal && Number(goal.to) < Number(goal.from)) {
      return 'Esta campaña ya recibió donaciones: su meta no se puede bajar.';
    }
    if (changes.category) {
      return 'Esta campaña ya recibió donaciones: su categoría no se puede cambiar.';
    }
  }
  return null;
}
