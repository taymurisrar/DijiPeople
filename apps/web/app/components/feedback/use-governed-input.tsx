"use client";

import { useCallback, useRef, useState } from "react";
import { Dialog } from "@/app/components/ui/dialog";

/**
 * Collect a governed value through the design system, instead of
 * `window.prompt`.
 *
 * BUG-0020 established the rule and fixed the two worst instances; ITEM-0031
 * is the rest. Four of the remaining six collected values that land in an
 * audited business record — a payroll reversal reason and date, a payment
 * failure reason, an application rejection reason, an attendance exception
 * note — and a native prompt gives all of them the same treatment: one line of
 * label, no validation, no cancel semantics distinguishable from an empty
 * answer, outside the theme, and impossible to assert against in a test.
 *
 * The payroll pair is the sharpest. A reversal *date* was collected as free
 * text with a pre-filled default, into a control that cannot reject "next
 * Tuesday" — a parsing failure waiting to happen, on a financial record read
 * during audit.
 *
 * ## Why a hook returning a promise
 *
 * The same reason `apps/admin`'s `useReasonPrompt` does it: the call sites read
 * as a straight sequence, and rewriting them into callback state machines would
 * be a bigger change than the defect warrants.
 *
 *     const reason = await requestValue({ ... });
 *     if (reason === null) return;   // cancelled, distinctly from ""
 *
 * This is the `apps/web` counterpart, built on this app's own `Dialog` — which
 * exists because BUG-0043 built it, and which supplies the focus trap, Escape
 * and dialog semantics a native prompt got for free and a bespoke div did not.
 */

export type GovernedInputRequest = {
  readonly title: string;
  readonly description?: string;
  readonly label: string;
  readonly hint?: string;
  readonly confirmLabel: string;
  /** `date` renders a real date input, so an unparseable value cannot be typed. */
  readonly kind?: "text" | "multiline" | "date";
  readonly initialValue?: string;
  /**
   * Minimum characters for text. A governed reason that says "x" is not a
   * reason. Ignored for `date`, where the control validates the shape.
   */
  readonly minLength?: number;
};

type Pending = GovernedInputRequest & {
  readonly resolve: (value: string | null) => void;
};

const DEFAULT_MIN_LENGTH = 5;
const MAX_LENGTH = 500;

export function useGovernedInput() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const pendingRef = useRef<Pending | null>(null);

  const requestValue = useCallback((request: GovernedInputRequest) => {
    return new Promise<string | null>((resolve) => {
      // A second request while one is open would strand the first promise for
      // ever, so the earlier one is cancelled explicitly rather than dropped.
      pendingRef.current?.resolve(null);
      const next = { ...request, resolve };
      pendingRef.current = next;
      setValue(request.initialValue ?? "");
      setTouched(false);
      setPending(next);
    });
  }, []);

  const settle = useCallback((result: string | null) => {
    pendingRef.current?.resolve(result);
    pendingRef.current = null;
    setPending(null);
    setValue("");
    setTouched(false);
  }, []);

  const kind = pending?.kind ?? "multiline";
  const minLength = kind === "date" ? 0 : pending?.minLength ?? DEFAULT_MIN_LENGTH;
  const trimmed = value.trim();
  const invalid =
    kind === "date" ? !isCalendarDate(trimmed) : trimmed.length < minLength;

  const message =
    kind === "date"
      ? "Choose a date."
      : `Enter at least ${minLength} characters explaining why.`;

  const dialog = pending ? (
    <Dialog
      description={pending.description}
      footer={
        <>
          <button
            className="rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface"
            onClick={() => settle(null)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            disabled={invalid}
            onClick={() => settle(trimmed)}
            type="button"
          >
            {pending.confirmLabel}
          </button>
        </>
      }
      onClose={() => settle(null)}
      open
      title={pending.title}
    >
      <label className="block text-sm font-medium text-foreground" htmlFor="governed-input">
        {pending.label}
      </label>
      {pending.hint ? (
        <p className="mt-1 text-xs text-muted" id="governed-input-hint">
          {pending.hint}
        </p>
      ) : null}

      {kind === "multiline" ? (
        <textarea
          aria-describedby="governed-input-error"
          aria-invalid={touched && invalid}
          className="mt-2 min-h-[96px] w-full rounded-2xl border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          id="governed-input"
          maxLength={MAX_LENGTH}
          onBlur={() => setTouched(true)}
          onChange={(event) => setValue(event.target.value)}
          value={value}
        />
      ) : (
        <input
          aria-describedby="governed-input-error"
          aria-invalid={touched && invalid}
          className="mt-2 w-full rounded-2xl border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          id="governed-input"
          maxLength={kind === "date" ? undefined : MAX_LENGTH}
          onBlur={() => setTouched(true)}
          onChange={(event) => setValue(event.target.value)}
          type={kind === "date" ? "date" : "text"}
          value={value}
        />
      )}

      <p
        className="mt-1 text-xs text-danger"
        id="governed-input-error"
        role={touched && invalid ? "alert" : undefined}
      >
        {touched && invalid ? message : " "}
      </p>
    </Dialog>
  ) : null;

  return { requestValue, governedInputDialog: dialog };
}

/**
 * A real calendar date, not merely something shaped like one.
 *
 * `2026-02-31` matches the pattern and is not a date; `Date.parse` accepts it by
 * rolling over into March, which on a payroll reversal would post the entry to
 * the wrong month. Round-tripping catches that.
 */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export { isCalendarDate };
