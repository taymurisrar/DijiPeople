"use client";

import { useCallback, useRef, useState } from "react";
import {
  DialogField,
  PanelButton,
  PanelDialog,
} from "../tenants/tenant-panel-ui";

export type ReasonPromptRequest = {
  title: string;
  description?: string;
  label: string;
  hint?: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  /** Minimum characters. A governed reason that says "x" is not a reason. */
  minLength?: number;
};

type PendingPrompt = ReasonPromptRequest & {
  resolve: (value: string | null) => void;
};

const DEFAULT_MIN_LENGTH = 5;
const MAX_LENGTH = 500;

/**
 * Collects a governed reason through the design system instead of
 * `window.prompt` (BUG-0020).
 *
 * WHY A HOOK RETURNING A PROMISE. The actions that need a reason are dispatched
 * from `runtime-record-action-handler.ts`, which is a plain module, not a
 * component — it cannot render a dialog. That is exactly why `window.prompt`
 * was reached for: it is the only input a non-React function can open. So the
 * capability is injected instead, the same way `openSignatureDialog` already is,
 * and the promise lets the handler keep reading as a straight sequence:
 *
 *     const reason = await requestReason({ ... });
 *     if (reason === null) return;   // cancelled
 *
 * A native prompt is unstyled, unlabelled beyond one string, unvalidated,
 * outside the app's theme, and impossible to assert against in a test. Every one
 * of those matters more here than usual, because the value becomes part of an
 * audited business record — a disqualification reason or a contract moved
 * backward is read later by someone deciding whether the decision was sound.
 */
export function useReasonPrompt() {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const pendingRef = useRef<PendingPrompt | null>(null);

  const requestReason = useCallback((request: ReasonPromptRequest) => {
    return new Promise<string | null>((resolve) => {
      // A second request while one is open would strand the first promise
      // forever, so the earlier one is cancelled explicitly.
      pendingRef.current?.resolve(null);
      const next = { ...request, resolve };
      pendingRef.current = next;
      setValue("");
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

  const minLength = pending?.minLength ?? DEFAULT_MIN_LENGTH;
  const trimmed = value.trim();
  const tooShort = trimmed.length < minLength;

  const dialog = pending ? (
    <PanelDialog
      title={pending.title}
      description={pending.description}
      tone={pending.tone ?? "default"}
      onClose={() => settle(null)}
      footer={
        <>
          <PanelButton onClick={() => settle(null)}>Cancel</PanelButton>
          <PanelButton
            variant="primary"
            disabled={tooShort}
            onClick={() => settle(trimmed)}
          >
            {pending.confirmLabel}
          </PanelButton>
        </>
      }
    >
      <DialogField label={pending.label} hint={pending.hint} required>
        <textarea
          className="min-h-[96px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
          value={value}
          maxLength={MAX_LENGTH}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={touched && tooShort}
          aria-describedby="reason-prompt-error"
        />
      </DialogField>
      <p
        id="reason-prompt-error"
        className="mt-1 text-[11px] text-rose-600"
        role={touched && tooShort ? "alert" : undefined}
      >
        {touched && tooShort
          ? `Enter at least ${minLength} characters explaining why.`
          : " "}
      </p>
    </PanelDialog>
  ) : null;

  return { requestReason, reasonDialog: dialog };
}
