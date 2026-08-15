"use client";

import { useCallback, useState } from "react";
import { formatDateTime, formatEnumLabel } from "@/lib/formatters";
import {
  DefinitionList,
  PanelButton,
  PanelCard,
  PanelEmptyState,
  PanelError,
  PanelLoading,
  StatePill,
} from "./tenant-panel-ui";
import {
  useTenantResource,
  type TenantSystemView,
} from "./tenant-control-plane.client";
import { TenantEraseDialog } from "./tenant-erase-dialog";

/**
 * System — internal platform metadata, and the one place tenant erasure lives.
 *
 * Technical identifiers belong here and nowhere else: a business tab that shows
 * a UUID has failed at its job. The Danger Zone is deliberately at the bottom of
 * this tab, far from Save and Edit, because the cost of a mis-click here is a
 * customer's data.
 */
export function TenantSystemPanel({
  tenantId,
  eraseRequested,
  onEraseHandled,
}: {
  tenantId: string;
  eraseRequested?: boolean;
  onEraseHandled?: () => void;
}) {
  const { data, loading, error, reload } = useTenantResource<TenantSystemView>(
    tenantId,
    "/system",
  );
  const [eraseOpenLocally, setEraseOpenLocally] = useState(false);
  /*
   * Opened either from the Danger Zone button or by the action bar asking for
   * it. Derived rather than copied into state inside an effect, so there is one
   * source of truth for whether the dialog is up.
   */
  const eraseOpen = eraseOpenLocally || Boolean(eraseRequested);
  const closeErase = useCallback(() => {
    setEraseOpenLocally(false);
    onEraseHandled?.();
  }, [onEraseHandled]);

  if (loading && !data)
    return (
      <PanelCard title="System">
        <PanelLoading label="system metadata" />
      </PanelCard>
    );
  if (error && !data)
    return (
      <PanelCard title="System">
        <PanelError message={error} onRetry={reload} />
      </PanelCard>
    );
  if (!data) return null;

  return (
    <div className="space-y-5">
      <PanelCard
        title="Platform identifiers"
        description="Technical references for support and integration work. Copy them here rather than reading them off a business screen."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(data.identifiers).map(([key, value]) => (
            <IdentifierRow key={key} label={formatEnumLabel(key)} value={value} />
          ))}
        </div>
      </PanelCard>

      <PanelCard
        title="Record history"
        description="Who created and last changed this tenant record."
      >
        <DefinitionList
          columns={2}
          items={[
            {
              label: "Created at",
              value: formatDateTime(data.record.createdAt),
            },
            {
              label: "Created by",
              value: data.record.createdByName ?? "System",
              hint: data.record.createdById ?? undefined,
            },
            {
              label: "Updated at",
              value: formatDateTime(data.record.updatedAt),
            },
            {
              label: "Updated by",
              value: data.record.updatedByName ?? "System",
              hint: data.record.updatedById ?? undefined,
            },
            {
              label: "Provisioned at",
              value: data.provisioning.provisionedAt
                ? formatDateTime(data.provisioning.provisionedAt)
                : "Not recorded",
              hint: data.provisioning.attempts
                ? `${data.provisioning.attempts} provisioning attempt${data.provisioning.attempts === 1 ? "" : "s"}`
                : undefined,
            },
            {
              label: "Demo data",
              value: data.record.isDemoData ? "Yes" : "No",
              hint: data.record.demoBatchId ?? undefined,
            },
            {
              label: "Seed source",
              value: data.record.seedSource ?? "Not seeded",
            },
          ]}
        />
      </PanelCard>

      {data.erasureReceipts.length ? (
        <PanelCard
          title="Erasure receipts"
          description="Platform records of erasure requests against this tenant. These survive the tenant itself."
        >
          <ul className="space-y-3">
            {data.erasureReceipts.map((receipt) => (
              <li
                key={receipt.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatePill
                    value={receipt.status}
                    tone={
                      receipt.status === "COMPLETED"
                        ? "success"
                        : receipt.status === "FAILED"
                          ? "danger"
                          : "warning"
                    }
                  />
                  <span className="text-xs text-slate-500">
                    {formatDateTime(receipt.requestedAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-800">{receipt.reason}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Requested by {receipt.requestedByName ?? "Unknown"}
                  {receipt.completedAt
                    ? ` · completed ${formatDateTime(receipt.completedAt)}`
                    : ""}
                </p>
                {/*
                  The reference the operator is given when an erasure fails is
                  the receipt id, so it has to be readable here — otherwise the
                  only way to match a reported failure to its diagnosis is a
                  database query.
                */}
                <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                  {receipt.id}
                </p>
                {receipt.failureMessage ? (
                  <p className="mt-1 text-xs text-rose-700">
                    {receipt.failureMessage}
                  </p>
                ) : null}
                {receipt.status === "FAILED" &&
                receipt.erasedRecordCounts ? (
                  <dl className="mt-2 grid gap-1 rounded-lg bg-rose-50 p-3 text-[11px] text-rose-900">
                    {(
                      [
                        ["Failed at phase", "failedAtPhase"],
                        ["Failed at model", "failedAtModel"],
                        ["Constraint", "constraint"],
                        ["Driver code", "prismaCode"],
                        ["Models processed", "modelsProcessed"],
                      ] as const
                    ).map(([label, key]) => {
                      const value = receipt.erasedRecordCounts?.[key];
                      if (value === null || value === undefined) return null;
                      return (
                        <div key={key} className="flex flex-wrap gap-2">
                          <dt className="font-semibold">{label}</dt>
                          <dd className="break-all font-mono">
                            {String(value)}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}
              </li>
            ))}
          </ul>
        </PanelCard>
      ) : null}

      <PanelCard
        tone="danger"
        title="Danger Zone"
        description="Operations here destroy data permanently. They are separated from ordinary record actions on purpose."
      >
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-rose-200 bg-white p-4">
          <div className="max-w-xl">
            <p className="text-sm font-semibold text-rose-900">Erase Tenant</p>
            <p className="mt-1 text-xs leading-5 text-rose-800">
              Permanently erase this tenant and its tenant-scoped data. This
              operation cannot be undone. Agreements, support history and the
              customer account are detached and kept; a platform erasure receipt
              records that the action happened.
            </p>
          </div>
          <PanelButton variant="danger" onClick={() => setEraseOpenLocally(true)}>
            Erase Tenant…
          </PanelButton>
        </div>
      </PanelCard>

      {eraseOpen ? (
        <TenantEraseDialog tenantId={tenantId} onClose={closeErase} />
      ) : null}
    </div>
  );
}

function IdentifierRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const [copied, setCopied] = useState(false);
  if (!value)
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">Not set</p>
      </div>
    );
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <code
          title={value}
          className="mt-0.5 block truncate font-mono text-xs text-slate-700"
        >
          {value}
        </code>
      </div>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function TenantSystemEmptyState() {
  return (
    <PanelEmptyState
      title="No system metadata is available."
      description="This tenant record could not be read."
    />
  );
}
