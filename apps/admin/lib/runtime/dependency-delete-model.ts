import type {
  RecordDependency,
  RecordDependencyReport,
} from "./platform-runtime.types";

/*
 * What a dependency-aware delete dialog shows, and whether it lets the operator
 * confirm (EXECPLAN-0055 D5).
 *
 * The dialog used to name the record and nothing else, so the first the
 * operator heard of "it still has 2 referral link(s)" was after confirming —
 * and from the command bar, with no way to reach the referral links from
 * there. The API now answers the same question before the delete, and this
 * model turns that answer into what the dialog renders.
 *
 * Kept free of React so the rules — what blocks, what cascades, when Confirm is
 * enabled — are tested directly.
 */

export type DependencyDeleteTarget = {
  id: string;
  label: string;
  /** `undefined` while loading, `null` when the module has no provider. */
  report?: RecordDependencyReport | null;
  /** Set when the check itself failed for this record. */
  error?: string;
};

export type DependencyDeleteRecordModel = {
  id: string;
  label: string;
  blocking: RecordDependency[];
  cascading: RecordDependency[];
  detaching: RecordDependency[];
  blocked: boolean;
};

export type DependencyDeleteModel = {
  status: "loading" | "unsupported" | "ready";
  records: DependencyDeleteRecordModel[];
  /** Records the delete will remove, given what is known now. */
  deletableCount: number;
  blockedCount: number;
  /** Checks that failed; shown, and they keep Confirm disabled. */
  errors: Array<{ id: string; label: string; message: string }>;
  canConfirm: boolean;
  /** Why Confirm is disabled, in one sentence; null when it is enabled. */
  disabledReason: string | null;
};

const blocks = (item: RecordDependency) =>
  item.count > 0 && (item.policy === "BLOCKS" || item.policy === "RETAIN");

export function buildDependencyDeleteModel(
  targets: DependencyDeleteTarget[],
): DependencyDeleteModel {
  const errors = targets
    .filter((target) => target.error)
    .map((target) => ({
      id: target.id,
      label: target.label,
      message: target.error as string,
    }));

  if (targets.some((target) => target.report === undefined && !target.error)) {
    return {
      status: "loading",
      records: [],
      deletableCount: 0,
      blockedCount: 0,
      errors,
      canConfirm: false,
      disabledReason: "Checking what depends on this…",
    };
  }

  /*
   * No provider for this module: nothing is known in advance, so the dialog is
   * the plain confirmation and the API still decides. Confirm stays enabled —
   * "we could not check" is not the same as "this is blocked".
   */
  if (targets.length && targets.every((target) => target.report === null)) {
    return {
      status: "unsupported",
      records: [],
      deletableCount: targets.length,
      blockedCount: 0,
      errors: [],
      canConfirm: true,
      disabledReason: null,
    };
  }

  const records = targets
    .filter((target) => target.report)
    .map((target) => {
      const dependencies = (target.report as RecordDependencyReport)
        .dependencies;
      const blocking = dependencies.filter(blocks);
      return {
        id: target.id,
        label: target.label,
        blocking,
        cascading: dependencies.filter(
          (item) => item.policy === "CASCADE" && item.count > 0,
        ),
        detaching: dependencies.filter(
          (item) => item.policy === "DETACH" && item.count > 0,
        ),
        /*
         * Either signal blocks. `canDelete` is the server's verdict and wins
         * if it disagrees with the rows, so a policy this console does not know
         * yet can never turn into an enabled Confirm.
         */
        blocked:
          blocking.length > 0 ||
          (target.report as RecordDependencyReport).canDelete === false,
      };
    });

  const blockedCount = records.filter((record) => record.blocked).length;
  const deletableCount = records.length - blockedCount;
  /*
   * A selection deletes what it can and keeps the rest — the API's contract —
   * so Confirm is enabled while at least one record would go. A failed check
   * disables it: the operator would be confirming without the information the
   * dialog exists to show.
   */
  const canConfirm = errors.length === 0 && deletableCount > 0;
  const disabledReason = canConfirm
    ? null
    : errors.length
      ? "The dependency check could not be completed. Close and try again."
      : targets.length === 1
        ? "Resolve the blocking records below before deleting."
        : "Every selected record has blocking records.";

  return {
    status: "ready",
    records,
    deletableCount,
    blockedCount,
    errors,
    canConfirm,
    disabledReason,
  };
}

/** "2 referral links" style count line for one dependency. */
export function describeDependencyCount(item: RecordDependency) {
  return `${item.count.toLocaleString()} ${item.label.toLowerCase()}`;
}
