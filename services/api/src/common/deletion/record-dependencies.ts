/**
 * The dependency contract a record answers before it is deleted
 * (EXECPLAN-0055 D5).
 *
 * The console used to learn why a delete was refused only by attempting it.
 * The operator pressed Delete, confirmed a dialog that named nothing but the
 * record, and was then told — in the command bar, after the fact — that the
 * partner "still has 3 agreement(s), 1 portal user(s)". The answer existed on
 * the server the whole time; it was simply never asked for first.
 *
 * Every relation a record has is classified with one of four policies:
 *
 * - `BLOCKS`  — related records that must be removed, deactivated or resolved
 *               first. The database would refuse (`Restrict`), or it would
 *               cascade into records the business must keep (commissions).
 * - `RETAIN`  — related records that keep a reference the business relies on
 *               (attribution). The database would quietly null it
 *               (`SetNull`); retaining it means the delete is refused.
 * - `CASCADE` — records that belong to this one and go with it, atomically.
 * - `DETACH`  — related records that survive with their reference cleared, and
 *               that losing the reference is acceptable for.
 *
 * `BLOCKS` and `RETAIN` with a non-zero count make `canDelete` false; the other
 * two never do. The distinction between the blocking pair is for the operator:
 * BLOCKS says "deal with these first", RETAIN says "these are why this record
 * must keep existing".
 */
export type RecordDependencyPolicy = 'BLOCKS' | 'CASCADE' | 'DETACH' | 'RETAIN';

export type RecordDependency = {
  /** Stable key, e.g. `referralLinks`. */
  key: string;
  /** Plural noun an operator reads, e.g. "Referral links". */
  label: string;
  count: number;
  /**
   * The count with its correctly pluralised noun, as the dialog prints it —
   * "1 contact", "2 referral links". Built by the provider because only it
   * knows the singular: the console used to lowercase `label`, which read
   * "1 portal users".
   */
  countLabel: string;
  policy: RecordDependencyPolicy;
  /** Why this policy, and what to do about it — one sentence. */
  reason: string;
  /** Admin route where the related records can be seen, when one exists. */
  href: string | null;
};

export type RecordDependencyReport = {
  canDelete: boolean;
  /** Only relations that actually have related rows (`count > 0`). */
  dependencies: RecordDependency[];
};

/**
 * What a runtime module implements to take part in the dependency check.
 *
 * Registered per module key in `PlatformRuntimeService`; a module without a
 * provider answers 404 from the dependencies route, and the console falls back
 * to the plain confirmation.
 */
export interface RecordDependencyProvider {
  describeDependencies(id: string): Promise<RecordDependencyReport>;
}

export function blocksDelete(dependency: RecordDependency) {
  return (
    dependency.count > 0 &&
    (dependency.policy === 'BLOCKS' || dependency.policy === 'RETAIN')
  );
}

export function buildDependencyReport(
  dependencies: RecordDependency[],
): RecordDependencyReport {
  const present = dependencies.filter((item) => item.count > 0);
  return {
    canDelete: !present.some(blocksDelete),
    dependencies: present,
  };
}

/**
 * Whether an error is a foreign-key refusal from the database.
 *
 * Read from the Prisma code when there is one and from the message otherwise:
 * with the pg driver adapter a referential failure does not always arrive as a
 * `PrismaClientKnownRequestError` (see `tenant-erasure.service.ts`).
 */
export function isForeignKeyViolation(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  if (code === 'P2003' || code === 'P2014' || code === '23503') return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return (
    message.includes('violates foreign key constraint') ||
    message.includes('violates RESTRICT') ||
    message.includes('Foreign key constraint violated')
  );
}
