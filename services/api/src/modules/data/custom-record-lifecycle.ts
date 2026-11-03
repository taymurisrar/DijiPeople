/**
 * What a custom record may do, by the kind of module that holds it.
 *
 * One definition, used by the data service to REFUSE the operation and by the
 * module metadata to HIDE the control, so the two cannot drift: a delete button
 * the API would reject, or one the API would accept that the UI hides, are both
 * defects. It is deliberately not a permission system — RBAC still decides who
 * may write; this decides what kind of change makes sense for the module at all.
 *
 *   STANDARD            edit, deactivate, delete
 *   ORGANIZATION_OWNED  edit, deactivate, delete (no per-user ownership view)
 *   IMMUTABLE           create only: ledger-style records are corrected by a new
 *                       record, never rewritten, deactivated or removed
 *   CONFIGURATION       edit, deactivate; never delete (other records may rely
 *                       on a setup value; retire it instead)
 */
import type { CustomizationModuleKind } from '@prisma/client';

export interface RecordLifecycle {
  readonly update: boolean;
  readonly deactivate: boolean;
  readonly delete: boolean;
  /** "My Records" is meaningful only where a person owns records. */
  readonly userOwned: boolean;
}

const LIFECYCLE: Readonly<Record<CustomizationModuleKind, RecordLifecycle>> = {
  STANDARD: { update: true, deactivate: true, delete: true, userOwned: true },
  ORGANIZATION_OWNED: {
    update: true,
    deactivate: true,
    delete: true,
    userOwned: false,
  },
  IMMUTABLE: {
    update: false,
    deactivate: false,
    delete: false,
    userOwned: false,
  },
  CONFIGURATION: {
    update: true,
    deactivate: true,
    delete: false,
    userOwned: false,
  },
};

export function lifecycleOf(
  kind: CustomizationModuleKind | null | undefined,
): RecordLifecycle {
  return LIFECYCLE[kind ?? 'STANDARD'];
}

export type RecordStatusFilter = 'active' | 'inactive' | 'all';

/** `?status=` — anything else is rejected by the caller, never silently widened to "all". */
export function parseStatusFilter(value: unknown): RecordStatusFilter | null {
  if (value === undefined || value === '') return 'all';
  return value === 'active' || value === 'inactive' || value === 'all'
    ? value
    : null;
}
