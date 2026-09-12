"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StandardModuleRecordPage } from "@/app/components/runtime";
import { Button } from "@/app/components/ui/button";
import { StatusPill } from "@/app/components/ui/status-pill";
import { humanizeEnumValue } from "@/lib/text/inflection";
import {
  isAuthFailure,
  retryEmailDeliveryLog,
  type EmailDeliveryLog,
} from "@/lib/notifications-api";
import type { FormMetadata } from "@/lib/runtime/metadata-runtime.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import type { StandardModuleRuntimeSpec } from "@/lib/runtime/modules/standard-module-runtime";
import type { RuntimeRecordData } from "@/app/components/runtime/module-runtime-ui.types";

/*
 * ITEM-0168. Deliberately NOT a generic runtime command: the settings-runtime
 * adapter for this screen is `mode: "read-only"` and has no non-CRUD command
 * extension point (unlike the domain-module command registry approvals uses),
 * and this screen's list still needs its BUG-3379 fixes — status/date
 * formatting on `module-data-table.tsx` — which a `mode: "specialized"`
 * rewrite of the whole screen would have thrown away. This wraps the same
 * generic `StandardModuleRecordPage` every read-only record uses and adds one
 * panel above it, the same pattern `WorkSiteRecordPage` already uses for a
 * different reason (custom sections a field grid cannot express).
 */
export function NotificationEmailLogRecordPage({
  activeForm,
  canRetry,
  mode,
  record,
  recordId,
  runtime,
  spec,
  title,
}: {
  readonly activeForm: FormMetadata | null;
  readonly canRetry: boolean;
  readonly mode: "create" | "read" | "edit";
  readonly record: RuntimeRecordData;
  readonly recordId?: string;
  readonly runtime: ModuleRuntimeContext;
  readonly spec: StandardModuleRuntimeSpec;
  readonly title?: string;
}) {
  const isRetryableRow =
    record.status === "FAILED" && record.retryable === true;

  return (
    <div className="grid gap-4">
      {mode === "read" && recordId && isRetryableRow && canRetry ? (
        <RetryDeliveryLogPanel deliveryLogId={recordId} />
      ) : null}
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode={mode}
        record={record}
        recordId={recordId}
        runtime={runtime}
        spec={spec}
        title={title}
      />
    </div>
  );
}

type RetryOutcome = {
  readonly status: string;
  readonly providerType: string | null;
  readonly errorMessage: string | null;
};

/*
 * The control itself. Visibility is decided entirely by the parent
 * (`isRetryableRow && canRetry`) — this component only ever renders once it
 * is already known to be legitimate to show, so there is no second gate to
 * keep in sync with the first.
 */
function RetryDeliveryLogPanel({ deliveryLogId }: { deliveryLogId: string }) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RetryOutcome | null>(null);

  async function retry() {
    setError(null);
    setIsRetrying(true);
    try {
      const result = await retryEmailDeliveryLog(deliveryLogId);
      setOutcome({
        status: result.newDeliveryLog.status,
        providerType: result.newDeliveryLog.providerType,
        errorMessage: result.newDeliveryLog.errorMessage,
      });
      // Refreshes the original row's own fields (retryCount, lastRetryAt)
      // behind the outcome panel above, without losing the outcome itself.
      router.refresh();
    } catch (err) {
      /*
       * `err.message` is what an operator needs to read, not a code: every
       * refusal on the server (sink provider, non-configurable event, a row
       * that predates variable capture) is thrown as an `AppError` with a
       * full sentence, and `requestJson` in `notifications-api.ts` already
       * unwraps that onto `NotificationRequestError.message` rather than
       * leaving `errorCode` as the only thing a caller can reach.
       */
      if (isAuthFailure(err)) {
        setError("Your session has expired. Sign in again to retry this delivery.");
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "This delivery could not be retried.",
        );
      }
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Retry this delivery
          </h3>
          <p className="mt-1 text-xs text-muted">
            Re-renders the original message with the variables it was sent
            with and attempts delivery again. This creates a new delivery
            record; this one is left as it is, aside from its retry count.
          </p>
        </div>
        <Button
          disabled={isRetrying}
          loading={isRetrying}
          loadingText="Retrying..."
          onClick={retry}
          type="button"
        >
          Retry Delivery
        </Button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {outcome ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm">
          <span className="font-medium text-foreground">New delivery:</span>
          <StatusPill tone={retryOutcomeTone(outcome.status)}>
            {humanizeEnumValue(outcome.status)}
          </StatusPill>
          {outcome.providerType ? (
            <span className="text-xs text-muted">
              via {humanizeEnumValue(outcome.providerType)}
            </span>
          ) : null}
          {outcome.errorMessage ? (
            <span className="text-xs text-muted">{outcome.errorMessage}</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function retryOutcomeTone(status: EmailDeliveryLog["status"] | string) {
  if (status === "SENT" || status === "DELIVERED") return "good" as const;
  if (status === "FAILED") return "danger" as const;
  if (status === "NOT_DELIVERED" || status === "SKIPPED") return "warning" as const;
  return "neutral" as const;
}
