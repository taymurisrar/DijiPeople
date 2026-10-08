import type { RuntimeActionResult } from "./platform-runtime.types";

/**
 * What a runtime delete actually did, read from where the API puts it.
 *
 * `PlatformRuntimeService.deleteRecords` answers `{ success: true, data: { … } }`
 * for every module, and `success` there only means the request was handled —
 * not that anything was deleted. The outcome lives inside `data`:
 * `{ deleted, refused, message }` from the partner deletion service, or
 * `{ deletedCount }` from the customer and onboarding ones.
 *
 * The console read `result.message` (always undefined at the top level) and
 * `result.success` (always true), so a partner the API had *kept* — "Nothing
 * was deleted. Kept 1: Acme — it still has the partner application it came
 * from" — navigated the operator back to the list as if it were gone, with no
 * word about why it was still there.
 *
 * `success` is therefore recomputed: a delete that refused any row is not a
 * success, even when others went, because the operator asked for all of them
 * and must be told which were kept. The API's own sentence is surfaced
 * unchanged; it already names the rows and the reason.
 */
export function readDeleteOutcome(
  result: RuntimeActionResult | null | undefined,
): RuntimeActionResult & { deleted?: number; refusedCount: number } {
  const data =
    result?.data &&
    typeof result.data === "object" &&
    !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : {};
  const refused = Array.isArray(data.refused) ? data.refused : [];
  const deleted =
    typeof data.deleted === "number"
      ? data.deleted
      : typeof data.deletedCount === "number"
        ? data.deletedCount
        : undefined;
  const message =
    (typeof data.message === "string" && data.message) ||
    result?.message ||
    undefined;
  const success =
    result?.success !== false && refused.length === 0 && deleted !== 0;
  return {
    ...(result ?? { success }),
    success,
    message: message ?? (success ? undefined : "Nothing was deleted."),
    deleted,
    refusedCount: refused.length,
  };
}

/**
 * The command-bar notice for whatever an action handler returned.
 *
 * Failure is read from the explicit `success: false` flag, never from the
 * wording. The message falls back to `data.message` because handlers on
 * bespoke pages can still hand back a raw `{ success, data }` runtime result,
 * and that is where the API puts the sentence worth showing.
 */
export function describeActionNotice(
  result: { success?: boolean; message?: string; data?: unknown } | void | null,
): { text: string; failed: boolean } | null {
  if (!result) return null;
  const failed = result.success === false;
  const nested =
    result.data &&
    typeof result.data === "object" &&
    !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>).message
      : undefined;
  const text =
    result.message ??
    (typeof nested === "string" && nested ? nested : undefined) ??
    (failed ? "Action could not be completed." : undefined);
  return text ? { text, failed } : null;
}

/**
 * The outcome of a record action the API handled, phrased for the command bar.
 *
 * Record actions answer in three shapes — `{ success, message }`,
 * `{ success, data }` and the bare `{ item, version }` envelope — and only the
 * first says anything. Without a fallback, a lifecycle command that worked left
 * the bar silent, which reads exactly like one that did nothing.
 */
export function describeRecordActionOutcome(
  result: RuntimeActionResult | { item?: unknown } | null | undefined,
  actionLabel: string,
): RuntimeActionResult {
  const value = (result ?? {}) as Partial<RuntimeActionResult>;
  const success = value.success !== false;
  return {
    ...value,
    success,
    message:
      value.message ??
      (success
        ? `${actionLabel} completed.`
        : `${actionLabel} could not be completed.`),
  };
}
