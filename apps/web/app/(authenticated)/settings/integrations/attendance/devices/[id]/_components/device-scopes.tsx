"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusPill } from "@/app/components/ui/status-pill";
import { scopeTypeLabel } from "../../../_lib/presentation";
import type { DeviceScope, DeviceScopeType } from "../../../_lib/types";

const SCOPE_TYPES: Array<{ value: DeviceScopeType; label: string }> = [
  { value: "ORGANIZATION", label: "Organization" },
  { value: "BUSINESS_UNIT", label: "Business unit" },
  { value: "DEPARTMENT", label: "Department" },
  { value: "TEAM", label: "Team" },
  { value: "EMPLOYEE", label: "Employee" },
];

type LookupOption = { id: string; name: string };

/**
 * Device access restrictions.
 *
 * The wording leads with the default — anyone authorised for the work site may
 * use the device — so an administrator does not read an empty list as "nobody
 * has access". Scopes are an exception mechanism, and the UI says so.
 */
export function DeviceScopes({
  deviceId,
  workSiteName,
  scopes,
  defaultBehaviour,
  lookups,
  canManage,
}: {
  deviceId: string;
  workSiteName: string | null;
  scopes: DeviceScope[];
  defaultBehaviour: string;
  lookups: {
    organizations: LookupOption[];
    businessUnits: LookupOption[];
    departments: LookupOption[];
    teams: LookupOption[];
  };
  canManage: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [scopeType, setScopeType] = useState<DeviceScopeType>("DEPARTMENT");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optionsForType: Record<string, LookupOption[]> = {
    ORGANIZATION: lookups.organizations,
    BUSINESS_UNIT: lookups.businessUnits,
    DEPARTMENT: lookups.departments,
    TEAM: lookups.teams,
    EMPLOYEE: [],
  };

  const targetField: Record<string, string> = {
    ORGANIZATION: "organizationId",
    BUSINESS_UNIT: "businessUnitId",
    DEPARTMENT: "departmentId",
    TEAM: "teamId",
    EMPLOYEE: "employeeId",
  };

  function scopeTargetName(scope: DeviceScope): string {
    const all = [
      ...lookups.organizations,
      ...lookups.businessUnits,
      ...lookups.departments,
      ...lookups.teams,
    ];
    const id =
      scope.organizationId ??
      scope.businessUnitId ??
      scope.departmentId ??
      scope.teamId ??
      scope.employeeId;
    if (!id) return "Whole organisation";
    return all.find((option) => option.id === id)?.name ?? id;
  }

  async function addScope() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/attendance/devices/${deviceId}/scopes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            scopeType,
            [targetField[scopeType]]: targetId,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(
          (body as { message?: string } | null)?.message ??
            "The restriction could not be added.",
        );
        return;
      }

      setAdding(false);
      setTargetId("");
      router.refresh();
    } catch {
      setError("The restriction could not be added. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeScope(scopeId: string) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/attendance/devices/${deviceId}/scopes/${scopeId}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        setError("The restriction could not be removed.");
        return;
      }
      router.refresh();
    } catch {
      setError("The restriction could not be removed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-[18px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
        <p className="font-semibold">
          By default, employees assigned to{" "}
          {workSiteName ? `${workSiteName}` : "this device's work site"} can use
          this device.
        </p>
        <p className="mt-1">
          Add a restriction only when this device should be limited further.
        </p>
        <p className="mt-1 text-xs">{defaultBehaviour}</p>
      </div>

      {scopes.length > 0 ? (
        <ul className="divide-y divide-border">
          {scopes.map((scope) => (
            <li
              key={scope.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {scopeTypeLabel(scope.scopeType)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {scopeTargetName(scope)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill tone={scope.isAllowed ? "good" : "danger"}>
                  {scope.isAllowed ? "Allowed" : "Excluded"}
                </StatusPill>
                {canManage ? (
                  <button
                    type="button"
                    className="rounded-2xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remove this restriction? Anyone authorised for the work site will be able to use this device again.",
                        )
                      ) {
                        void removeScope(scope.id);
                      }
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No restrictions. This device follows the default above.
        </p>
      )}

      {error ? (
        <p className="text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {canManage ? (
        adding ? (
          <div className="grid gap-4 rounded-[18px] border border-border bg-white/70 p-4 sm:grid-cols-3">
            <div>
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="scope-type"
              >
                Restrict to
              </label>
              <select
                id="scope-type"
                className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                value={scopeType}
                onChange={(event) => {
                  setScopeType(event.target.value as DeviceScopeType);
                  setTargetId("");
                }}
              >
                {SCOPE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="scope-target"
              >
                {scopeTypeLabel(scopeType)}
              </label>
              {scopeType === "EMPLOYEE" ? (
                <input
                  id="scope-target"
                  className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                  placeholder="Employee ID"
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                />
              ) : (
                <select
                  id="scope-target"
                  className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                >
                  <option value="">Select…</option>
                  {(optionsForType[scopeType] ?? []).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex gap-3 sm:col-span-3">
              <button
                type="button"
                className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
                disabled={busy || !targetId}
                onClick={() => void addScope()}
              >
                {busy ? "Adding…" : "Add restriction"}
              </button>
              <button
                type="button"
                className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
              onClick={() => setAdding(true)}
            >
              Restrict device access
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}
