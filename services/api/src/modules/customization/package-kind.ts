/*
 * The three kinds of package a workspace can hold — TASK-0033.
 *
 * Derived, never stored: the flags it reads are the facts, and a stored kind
 * would be one more thing to keep in step with them.
 *
 * - system    DijiPeople Core. Platform-owned, read-only, never exported.
 * - editable  Authored in this workspace. Changes, releases and exports here.
 * - installed Imported from another environment. Read-only until detached.
 */
export type PackageKind = 'system' | 'editable' | 'installed';

export function packageKind(record: {
  isDefault: boolean;
  isSystem: boolean;
  isManaged: boolean;
  origin: string;
}): PackageKind {
  if (record.isDefault || record.isSystem) return 'system';
  if (record.origin === 'IMPORTED' || record.isManaged) return 'installed';
  return 'editable';
}
