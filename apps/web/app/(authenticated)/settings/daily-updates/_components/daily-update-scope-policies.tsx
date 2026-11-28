"use client";

import { useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { workRequest } from "../../../work/_lib/work-client";
import {
  CADENCE_LABELS,
  deadlineLabel,
  escalationLabel,
  scopeTargetOf,
  workingDaysLabel,
  type ScopePolicy,
} from "../../../work/_lib/daily-updates";
import { ScopePolicyDialog, type ScopeOption } from "./scope-policy-dialog";

type ScopePolicyPage = { items: ScopePolicy[] };

/**
 * The team and business-unit policies. The most specific scope wins: a team's own
 * policy, else its business unit's, else the tenant policy above.
 */
export function DailyUpdateScopePolicies({
  businessUnits,
  initialPolicies,
  teams,
}: {
  businessUnits: ScopeOption[];
  initialPolicies: ScopePolicy[];
  teams: ScopeOption[];
}) {
  const [policies, setPolicies] = useState<ScopePolicy[]>(initialPolicies);
  const [editing, setEditing] = useState<ScopePolicy | "new" | null>(null);
  const [removing, setRemoving] = useState<ScopePolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetName = (policy: ScopePolicy) => {
    const target = scopeTargetOf(policy);
    if (!target) return "Unknown";
    const list = target.kind === "TEAM" ? teams : businessUnits;
    const name = list.find((o) => o.id === target.id)?.name ?? target.id.slice(0, 8);
    return `${target.kind === "TEAM" ? "Team" : "Business unit"}: ${name}`;
  };

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await workRequest<ScopePolicyPage>(
        "daily-updates",
        "/scope-policies",
      );
      setPolicies(page.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await workRequest("daily-updates", `/scope-policies/${removing.id}`, {
        method: "DELETE",
      });
      setRemoving(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  const columns: DataTableColumn<ScopePolicy>[] = [
    {
      key: "scope",
      header: "Applies to",
      sortable: true,
      sortAccessor: (row) => targetName(row),
      searchAccessor: (row) => targetName(row),
      render: (row) => (
        <span className="font-medium text-foreground">{targetName(row)}</span>
      ),
    },
    {
      key: "state",
      header: "State",
      render: (row) => (
        <StatusPill tone={row.enabled ? "good" : "muted"}>
          {row.enabled ? "Enabled" : "Disabled"}
        </StatusPill>
      ),
    },
    {
      key: "cadence",
      header: "Cadence",
      render: (row) => CADENCE_LABELS[row.cadence],
    },
    {
      key: "days",
      header: "Working days",
      render: (row) =>
        row.cadence === "WORKING_DAYS" ? workingDaysLabel(row.workingDays) : "Per shift",
    },
    {
      key: "deadline",
      header: "Deadline",
      render: (row) => `${deadlineLabel(row)} (${row.timezone})`,
    },
    {
      key: "ack",
      header: "Acknowledgement",
      render: (row) => (row.requireAcknowledgement ? "Required" : "Not required"),
    },
    {
      key: "escalation",
      header: "Escalation",
      render: (row) => escalationLabel(row.escalateAfterMinutes),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <Button
            aria-label={`Edit ${targetName(row)}`}
            onClick={() => setEditing(row)}
            size="xs"
            variant="outline"
          >
            Edit
          </Button>
          <Button
            aria-label={`Delete ${targetName(row)}`}
            onClick={() => setRemoving(row)}
            size="xs"
            variant="outline"
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <SectionCard title="Scoped policies">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-busy={loading}>
        <div>
          <Button onClick={() => setEditing("new")}>Add scoped policy</Button>
        </div>
        {error ? (
          <div className="grid gap-3" role="alert">
            <p className="text-sm text-danger">{error}</p>
            <div>
              <Button onClick={() => void reload()} variant="secondary">
                Retry
              </Button>
            </div>
          </div>
        ) : null}
        <DataTable
          columns={columns}
          emptyState={
            <EmptyState
              description="No team or business unit has its own policy."
              title="No scoped policies"
            />
          }
          entityLogicalName="daily-update-scope-policies"
          getRowKey={(row) => row.id}
          pagination={{ page: 1, pageSize: 10, total: policies.length }}
          rows={policies}
          searchPlaceholder="Search scoped policies"
        />
      </div>

      {editing ? (
        <ScopePolicyDialog
          businessUnits={businessUnits}
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
          teams={teams}
        />
      ) : null}
      {removing ? (
        <Dialog
          busy={busy}
          footer={
            <>
              <Button onClick={() => setRemoving(null)} variant="secondary">
                Cancel
              </Button>
              <Button loading={busy} onClick={() => void remove()}>
                Delete scoped policy
              </Button>
            </>
          }
          onClose={() => setRemoving(null)}
          open
          title={`Delete policy for ${targetName(removing)}`}
        >
          <p className="text-sm text-foreground">
            {`Delete the scoped policy for ${targetName(removing)}?`}
          </p>
        </Dialog>
      ) : null}
    </SectionCard>
  );
}
