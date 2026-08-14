"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  formatDateTime,
  mappingStatusLabel,
  mappingStatusTone,
  matchPresentation,
} from "../../_lib/presentation";
import type {
  ExternalDeviceUser,
  MappingHistoryEntry,
  MatchCandidate,
  MatchResult,
} from "../../_lib/types";

/**
 * Employee mapping.
 *
 * The governing rule, enforced visually as well as in the API: a name-only
 * suggestion is never presented as a decision already made. It is labelled a
 * possible match, tinted as a caution, and its confirm button says so — because
 * two people can share a name and mis-attributing attendance is a payroll error
 * that is painful to unpick.
 */
export function MappingWorkspace({
  externalUsers,
  canManage,
}: {
  externalUsers: ExternalDeviceUser[];
  canManage: boolean;
}) {
  const [selected, setSelected] = useState<ExternalDeviceUser | null>(null);

  const columns = useMemo<DataTableColumn<ExternalDeviceUser>[]>(
    () => [
      {
        key: "externalName",
        header: "External user",
        sortable: true,
        searchable: true,
        sortAccessor: (row) => row.externalName ?? row.externalUserId,
        searchAccessor: (row) =>
          `${row.externalName ?? ""} ${row.externalUserId}`,
        render: (row) => (
          <div>
            <p className="text-sm font-semibold text-foreground">
              {row.externalName ?? "Unnamed user"}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted">
              ID {row.externalUserId}
            </p>
          </div>
        ),
      },
      {
        key: "provider",
        header: "Provider",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => row.provider,
        render: (row) => (
          <span className="text-sm text-muted">{row.provider}</span>
        ),
      },
      {
        key: "device",
        header: "Device",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => row.device?.name ?? "Integration-wide",
        render: (row) => (
          <span className="text-sm text-foreground">
            {row.device?.name ?? "Integration-wide"}
          </span>
        ),
      },
      {
        key: "mappedEmployee",
        header: "Mapped employee",
        sortable: true,
        sortAccessor: (row) =>
          row.mappedEmployee
            ? `${row.mappedEmployee.firstName} ${row.mappedEmployee.lastName}`
            : "",
        render: (row) =>
          row.mappedEmployee ? (
            <div>
              <p className="text-sm font-semibold text-foreground">
                {row.mappedEmployee.firstName} {row.mappedEmployee.lastName}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {row.mappedEmployee.employeeCode}
              </p>
            </div>
          ) : (
            <span className="text-sm text-muted">Not mapped</span>
          ),
      },
      {
        key: "mappingStatus",
        header: "Status",
        sortable: true,
        filterable: true,
        filterType: "select",
        sortAccessor: (row) => mappingStatusLabel(row.mappingStatus),
        filterAccessor: (row) => mappingStatusLabel(row.mappingStatus),
        render: (row) => (
          <StatusPill tone={mappingStatusTone(row.mappingStatus)}>
            {mappingStatusLabel(row.mappingStatus)}
          </StatusPill>
        ),
      },
      {
        key: "lastSeenAt",
        header: "Last seen",
        sortable: true,
        sortAccessor: (row) => (row.lastSeenAt ? new Date(row.lastSeenAt) : null),
        render: (row) => (
          <span className="text-sm text-muted">
            {formatDateTime(row.lastSeenAt)}
          </span>
        ),
      },
      {
        key: "actions",
        header: "",
        render: (row) =>
          canManage ? (
            <button
              type="button"
              className="rounded-2xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-strong"
              onClick={() => setSelected(row)}
            >
              {row.mappingStatus === "MATCHED" ? "Change" : "Resolve"}
            </button>
          ) : null,
      },
    ],
    [canManage],
  );

  if (externalUsers.length === 0) {
    return (
      <EmptyState
        title="No external device users have been discovered yet"
        description="Once a gateway reads your attendance devices, the users stored on them appear here to be matched with employees."
      />
    );
  }

  return (
    <>
      <DataTable
        rows={externalUsers}
        columns={columns}
        getRowKey={(row) => row.id}
        entityLogicalName="external_device_user"
        searchPlaceholder="Search by name or device ID"
        // Unresolved entries first: they are the ones needing action.
        initialSort={{ columnKey: "mappingStatus", direction: "asc" }}
        emptyState={
          <EmptyState
            title="No device users match your filters"
            description="Adjust the filters or search to see more results."
          />
        }
      />

      {selected ? (
        <MappingDialog
          externalUser={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function MappingDialog({
  externalUser,
  onClose,
}: {
  externalUser: ExternalDeviceUser;
  onClose: () => void;
}) {
  const [suggestions, setSuggestions] = useState<MatchResult | null>(null);
  const [history, setHistory] = useState<MappingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualEmployeeId, setManualEmployeeId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // History is supporting context, so a failure there must not stop the
        // suggestions the administrator actually came here to act on.
        const [suggestionResponse, historyResponse] = await Promise.all([
          fetch(
            `/api/integrations/attendance/external-users/${externalUser.id}/suggestions`,
          ),
          fetch(
            `/api/integrations/attendance/external-users/${externalUser.id}/history`,
          ).catch(() => null),
        ]);

        if (!suggestionResponse.ok) throw new Error("failed");
        const payload = (await suggestionResponse.json()) as MatchResult;
        if (!cancelled) setSuggestions(payload);

        if (historyResponse?.ok) {
          const historyPayload = (await historyResponse.json()) as {
            items?: MappingHistoryEntry[];
          };
          if (!cancelled) setHistory(historyPayload.items ?? []);
        }
      } catch {
        if (!cancelled) setError("Suggestions could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [externalUser.id]);

  async function confirm(employeeId: string) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/attendance/external-users/${externalUser.id}/map`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ employeeId }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(
          (body as { message?: string } | null)?.message ??
            "The mapping could not be saved.",
        );
        return;
      }

      onClose();
      window.location.reload();
    } catch {
      setError("The mapping could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function ignore(next: boolean) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/attendance/external-users/${externalUser.id}/${next ? "ignore" : "unignore"}`,
        { method: "POST" },
      );
      if (!response.ok) {
        setError("The change could not be saved.");
        return;
      }
      onClose();
      window.location.reload();
    } catch {
      setError("The change could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-border bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Match device user
            </h2>
            <p className="mt-1 text-sm text-muted">
              {externalUser.externalName ?? "Unnamed user"} · ID{" "}
              {externalUser.externalUserId}
              {externalUser.device ? ` · ${externalUser.device.name}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="rounded-2xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-muted">Looking for matches…</p>
        ) : (
          <div className="mt-6 grid gap-4">
            {suggestions?.conflict ? (
              <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <p className="font-semibold">Needs review</p>
                <p className="mt-1">{suggestions.conflictReason}</p>
              </div>
            ) : null}

            {suggestions?.autoMatch ? (
              <CandidateCard
                candidate={suggestions.autoMatch}
                busy={busy}
                onConfirm={() => void confirm(suggestions.autoMatch!.employeeId)}
              />
            ) : null}

            {suggestions?.suggestions.length ? (
              <div className="grid gap-3">
                <p className="text-sm font-semibold text-foreground">
                  Possible matches
                </p>
                {suggestions.suggestions.map((candidate) => (
                  <CandidateCard
                    key={candidate.employeeId}
                    candidate={candidate}
                    busy={busy}
                    onConfirm={() => void confirm(candidate.employeeId)}
                  />
                ))}
              </div>
            ) : null}

            {!suggestions?.autoMatch && !suggestions?.suggestions.length ? (
              <p className="text-sm text-muted">
                No automatic match was found. Choose an employee below.
              </p>
            ) : null}

            <div className="rounded-[18px] border border-border bg-white/70 p-4">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="manual-employee"
              >
                Choose another employee
              </label>
              <input
                id="manual-employee"
                className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                placeholder="Employee ID"
                value={manualEmployeeId}
                onChange={(event) => setManualEmployeeId(event.target.value)}
              />
              <button
                type="button"
                className="mt-3 rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
                disabled={busy || !manualEmployeeId.trim()}
                onClick={() => void confirm(manualEmployeeId.trim())}
              >
                Map to this employee
              </button>
            </div>

            {error ? (
              <p className="text-sm font-medium text-red-600" role="alert">
                {error}
              </p>
            ) : null}

            {history.length > 0 ? (
              <div className="rounded-[18px] border border-border bg-white/70 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Mapping history
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Changing a mapping supersedes the previous link rather than
                  deleting it, so attendance already collected stays
                  attributable.
                </p>
                <ul className="mt-3 divide-y divide-border">
                  {history.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {entry.employee
                            ? `${entry.employee.firstName} ${entry.employee.lastName}`.trim()
                            : "Unknown employee"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {entry.device?.name ?? "All devices"} ·{" "}
                          {entry.provider} ·{" "}
                          {entry.validFrom
                            ? `from ${formatDateTime(entry.validFrom)}`
                            : "no start date"}
                          {entry.validTo
                            ? ` until ${formatDateTime(entry.validTo)}`
                            : ""}
                        </p>
                      </div>
                      <StatusPill
                        tone={entry.status === "ACTIVE" ? "good" : "muted"}
                      >
                        {entry.status === "ACTIVE" ? "Active" : "Superseded"}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 border-t border-border pt-4">
              {externalUser.mappedEmployee ? (
                <Link
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
                  href={`/employees/${externalUser.mappedEmployee.id}`}
                >
                  View employee
                </Link>
              ) : null}
              {externalUser.device ? (
                <Link
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
                  href={`/settings/integrations/attendance/devices/${externalUser.device.id}`}
                >
                  View device
                </Link>
              ) : null}
              {externalUser.mappingStatus === "IGNORED" ? (
                <button
                  type="button"
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void ignore(false)}
                >
                  Stop ignoring
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void ignore(true)}
                >
                  Ignore this user
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  busy,
  onConfirm,
}: {
  candidate: MatchCandidate;
  busy: boolean;
  onConfirm: () => void;
}) {
  const presentation = matchPresentation(candidate);
  const nameOnly = candidate.strategy === "NAME_SUGGESTION";

  return (
    <div
      className={`rounded-[18px] border p-4 ${
        nameOnly
          ? "border-amber-200 bg-amber-50"
          : "border-emerald-200 bg-emerald-50/60"
      }`}
      data-testid={
        nameOnly ? "candidate-name-only" : `candidate-${candidate.strategy}`
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {candidate.displayName}
          </p>
          <p className="mt-0.5 text-xs text-muted">{candidate.employeeCode}</p>
        </div>
        <StatusPill tone={presentation.tone}>{presentation.label}</StatusPill>
      </div>

      <p className="mt-2 text-xs leading-5 text-muted">{candidate.reason}</p>

      <button
        type="button"
        className="mt-3 rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
        disabled={busy}
        onClick={onConfirm}
      >
        {nameOnly ? "Confirm this is the same person" : "Confirm match"}
      </button>
    </div>
  );
}
