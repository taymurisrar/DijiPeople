"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
  DialogField,
  PanelButton,
  PanelDialog,
  PanelError,
  PanelLoading,
  dialogInputClass,
} from "./tenant-panel-ui";
import {
  describeError,
  isTransportFailure,
  reconcileWithErasureReceipt,
  tenantRequest,
  useTenantResource,
  type TenantErasurePreflight,
} from "./tenant-control-plane.client";

/**
 * Erase Tenant.
 *
 * Intentionally difficult. Authorisation, a written reason, the tenant's exact
 * name, a literal confirmation phrase and an explicit acknowledgement are all
 * required — and every one of them is re-checked by the API, because a dialog
 * only slows down the person using the UI. The screen also states what survives,
 * so nobody discovers afterwards that the agreements were kept or that the
 * invoices were not.
 */
export function TenantEraseDialog({
  tenantId,
  onClose,
}: {
  tenantId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data, loading, error, reload } =
    useTenantResource<TenantErasurePreflight>(tenantId, "/erasure-preflight");
  const [reason, setReason] = useState("");
  const [typedName, setTypedName] = useState("");
  const [typedPhrase, setTypedPhrase] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [acknowledgeBilling, setAcknowledgeBilling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const blocked = (data?.blockers.length ?? 0) > 0;
  const ready =
    Boolean(data) &&
    !blocked &&
    reason.trim().length >= 10 &&
    typedName === data?.tenant.name &&
    typedPhrase === data?.confirmationPhrase &&
    acknowledged &&
    (!data?.requiresBillingAcknowledgement || acknowledgeBilling);

  return (
    <PanelDialog
      title="Permanently erase this tenant"
      description="This destroys the tenant's data. There is no restore path and no undo."
      tone="danger"
      wide
      onClose={onClose}
      footer={
        <>
          <PanelButton onClick={onClose}>Cancel</PanelButton>
          <PanelButton
            variant="danger"
            busy={busy}
            disabled={!ready}
            onClick={async () => {
              if (!data) return;
              setBusy(true);
              setFailure(null);
              try {
                await tenantRequest(tenantId, "/erase", {
                  method: "POST",
                  body: JSON.stringify({
                    reason: reason.trim(),
                    confirmTenantName: typedName,
                    confirmPhrase: typedPhrase,
                    acknowledged,
                    acknowledgeOutstandingBilling: acknowledgeBilling,
                  }),
                });
                router.push("/tenants");
              } catch (reason_) {
                /*
                 * A lost response is not the same as a failure. Erasure runs in
                 * one long transaction behind a proxy, so a 502 or a dropped
                 * connection can arrive after the work has already committed —
                 * and telling the operator it failed when the tenant is gone is
                 * worse than telling them nothing. The receipt is written before
                 * anything is deleted and survives the tenant, so it is the only
                 * thing that can answer what actually happened.
                 */
                if (isTransportFailure(reason_)) {
                  const outcome = await reconcileWithErasureReceipt(tenantId);
                  if (outcome.erased) {
                    router.push("/tenants");
                    return;
                  }
                  setFailure(outcome.message);
                } else {
                  setFailure(
                    describeError(
                      reason_,
                      "The erasure could not be completed.",
                    ),
                  );
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            Permanently Erase Tenant
          </PanelButton>
        </>
      }
    >
      {loading && !data ? (
        <PanelLoading label="the erasure preflight" />
      ) : error && !data ? (
        <PanelError message={error} onRetry={reload} />
      ) : data ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-rose-700"
              aria-hidden
            />
            <p className="text-sm leading-6 text-rose-900">
              Permanently erase this tenant and its tenant-scoped data. This
              operation cannot be undone.
            </p>
          </div>

          <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Tenant
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                {data.tenant.name}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Customer
              </dt>
              <dd className="mt-0.5 text-sm text-slate-900">
                {data.customer?.companyName ?? "Not linked"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Tenant ID
              </dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-slate-700">
                {data.tenant.id}
              </dd>
            </div>
          </dl>

          {blocked ? (
            <div className="rounded-xl border border-rose-200 bg-white p-4">
              <p className="text-sm font-semibold text-rose-900">
                Erasure is blocked
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-800">
                {data.blockers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <ErasureDryRun tenantId={tenantId} />


          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Will be destroyed
              </p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                <li>{data.impact.employees} employee records</li>
                <li>{data.impact.users} user accounts</li>
                <li>{data.impact.documents} documents and their files</li>
                <li>{data.impact.payrollRuns} payroll runs</li>
                <li>
                  All invoices and payments for this tenant
                  {data.impact.unpaidInvoices
                    ? `, including ${data.impact.unpaidInvoices} unpaid`
                    : ""}
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Will be kept
              </p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                <li>
                  {data.retained.contracts} agreements, detached from the tenant
                </li>
                <li>
                  {data.retained.supportCases} support cases, detached from the
                  tenant
                </li>
                <li>The customer account and its onboarding history</li>
                <li>A platform erasure receipt recording this action</li>
              </ul>
            </div>
          </div>

          {data.warnings.length ? (
            <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {data.warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}

          <DialogField
            label="Reason for erasure"
            required
            hint="Recorded on the platform erasure receipt. At least 10 characters."
          >
            <textarea
              rows={3}
              className={`${dialogInputClass} h-auto py-2`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Contract terminated; customer requested deletion of all workspace data."
            />
          </DialogField>

          <DialogField
            label={`Type the tenant name exactly: ${data.tenant.name}`}
            required
          >
            <input
              className={dialogInputClass}
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
              autoComplete="off"
            />
          </DialogField>

          <DialogField
            label={`Type ${data.confirmationPhrase} to confirm`}
            required
          >
            <input
              className={dialogInputClass}
              value={typedPhrase}
              onChange={(event) => setTypedPhrase(event.target.value)}
              autoComplete="off"
            />
          </DialogField>

          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-rose-600"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I understand this permanently destroys this tenant&apos;s data and
              that it cannot be recovered.
            </span>
          </label>

          {data.requiresBillingAcknowledgement ? (
            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-rose-600"
                checked={acknowledgeBilling}
                onChange={(event) =>
                  setAcknowledgeBilling(event.target.checked)
                }
              />
              <span>
                I understand {data.impact.unpaidInvoices} unpaid invoice
                {data.impact.unpaidInvoices === 1 ? "" : "s"} will be destroyed
                with the tenant.
              </span>
            </label>
          ) : null}

          {failure ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
            >
              {failure}
            </p>
          ) : null}
        </div>
      ) : null}
    </PanelDialog>
  );
}

type DryRunResult = {
  wouldSucceed: boolean;
  durationMs: number;
  summary: string;
  blocker: {
    phase: string;
    model: string | null;
    constraint: string | null;
    blockedBy: string | null;
    prismaCode: string | null;
    modelsProcessed: number;
    detail: string;
  } | null;
};

/**
 * Ask what would happen, before doing the thing that cannot be undone.
 *
 * A refused erasure reports the first constraint that fired and then the
 * transaction is gone, so a failure used to leave the operator choosing between
 * reading production logs and retrying an irreversible operation to see whether
 * it fails differently. This runs the identical sequence and rolls it back.
 */
function ErasureDryRun({ tenantId }: { tenantId: string }) {
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            Check what would block this erasure
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Runs the full erasure inside a transaction that is always rolled
            back. Nothing is deleted. On a large tenant this can take a minute
            and holds row locks while it runs.
          </p>
        </div>
        <PanelButton
          busy={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            setResult(null);
            try {
              setResult(
                await tenantRequest<DryRunResult>(
                  tenantId,
                  "/erasure-dry-run",
                  { method: "POST", body: JSON.stringify({}) },
                ),
              );
            } catch (reason) {
              setError(
                describeError(reason, "The dry run could not be completed."),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Run check
        </PanelButton>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            result.wouldSucceed
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <p className="font-medium">{result.summary}</p>
          {result.blocker ? (
            <dl className="mt-2 grid gap-1 text-xs">
              <Detail label="Phase" value={result.blocker.phase} />
              <Detail label="Model" value={result.blocker.model} />
              <Detail label="Constraint" value={result.blocker.constraint} />
              <Detail label="Referencing table" value={result.blocker.blockedBy} />
              <Detail label="Driver code" value={result.blocker.prismaCode} />
              <div className="mt-1">
                <dt className="font-semibold">Raw</dt>
                <dd className="mt-0.5 break-all font-mono text-[11px] leading-4">
                  {result.blocker.detail}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="font-semibold">{label}</dt>
      <dd className="break-all font-mono">{value}</dd>
    </div>
  );
}

