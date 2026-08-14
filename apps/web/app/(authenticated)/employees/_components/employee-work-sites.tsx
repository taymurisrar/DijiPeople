"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "../../settings/integrations/attendance/_lib/presentation";
import type {
  EmployeeWorkSitesResponse,
} from "../../settings/integrations/attendance/_lib/types";

type LocationOption = { id: string; name: string; isActive: boolean };

/**
 * Authorised work sites for one employee.
 *
 * `Employee.locationId` remains the primary work site and is not duplicated
 * here — every primary change goes through the backend operation, which moves
 * `locationId` and the assignment flag in one transaction. Patching them
 * separately from the client is what would let an employee end up with a home
 * site they are not authorised to attend.
 */
export function EmployeeWorkSites({
  employeeId,
  data,
  locations,
  canManage,
}: {
  employeeId: string;
  data: EmployeeWorkSitesResponse;
  locations: LocationOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Location id whose validity dates are being edited inline, if any. */
  const [editing, setEditing] = useState<string | null>(null);
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");

  const active = data.assignments.filter(
    (assignment) => assignment.status === "ACTIVE",
  );
  const assignedIds = new Set(active.map((assignment) => assignment.locationId));
  const inherited = data.authorized.some(
    (site) => site.derivedFromPrimaryLocation,
  );

  const addable = locations.filter(
    (location) => location.isActive && !assignedIds.has(location.id),
  );

  async function call(
    path: string,
    init: RequestInit,
    failure: string,
  ): Promise<boolean> {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(path, init);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(body?.message ?? failure);
        return false;
      }

      router.refresh();
      return true;
    } catch {
      setError(`${failure} Try again.`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addWorkSite() {
    const added = await call(
      `/api/integrations/attendance/employees/${employeeId}/work-sites`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId,
          // Never sent as primary from here. Promoting a site is a separate,
          // deliberate action so it is not something an administrator does by
          // accident while adding a second site.
          isPrimary: false,
          validFrom: validFrom || undefined,
          validTo: validTo || undefined,
        }),
      },
      "The work site could not be added.",
    );

    if (added) {
      setAdding(false);
      setLocationId("");
      setValidFrom("");
      setValidTo("");
    }
  }

  /**
   * Validity dates are changed through the same assign operation, which upserts
   * on (employee, work site). Sending `isPrimary` is deliberately omitted so an
   * edit of the dates cannot silently move the employee's primary site.
   */
  async function saveValidity(targetLocationId: string) {
    const saved = await call(
      `/api/integrations/attendance/employees/${employeeId}/work-sites`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId: targetLocationId,
          validFrom: editFrom || undefined,
          validTo: editTo || undefined,
        }),
      },
      "The validity dates could not be saved.",
    );

    if (saved) {
      setEditing(null);
    }
  }

  function setPrimary(targetLocationId: string) {
    return call(
      `/api/integrations/attendance/employees/${employeeId}/work-sites/primary`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationId: targetLocationId }),
      },
      "The primary work site could not be changed.",
    );
  }

  function removeWorkSite(targetLocationId: string) {
    return call(
      `/api/integrations/attendance/employees/${employeeId}/work-sites/${targetLocationId}`,
      { method: "DELETE" },
      "The work site could not be removed.",
    );
  }

  return (
    <section className="rounded-[22px] border border-border bg-white/70 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Authorised work sites
          </h2>
          <p className="mt-1 text-sm text-muted">
            Where this employee may record attendance. Attendance devices at
            these sites will accept their punches.
          </p>
        </div>

        {canManage && !adding ? (
          <button
            type="button"
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
            onClick={() => setAdding(true)}
          >
            Add work site
          </button>
        ) : null}
      </header>

      {inherited ? (
        <p className="mt-4 rounded-[18px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
          This employee has no explicit work site assignment, so they are
          authorised for their primary work site only. Adding an assignment
          replaces that inherited access.
        </p>
      ) : null}

      {active.length > 0 ? (
        <ul className="mt-4 divide-y divide-border">
          {active.map((assignment) => (
            <li
              key={assignment.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {assignment.location.name}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {assignment.validFrom || assignment.validTo
                    ? `${assignment.validFrom ? `From ${formatDateTime(assignment.validFrom)}` : "No start date"} · ${
                        assignment.validTo
                          ? `until ${formatDateTime(assignment.validTo)}`
                          : "no end date"
                      }`
                    : "No date restriction"}
                  {assignment.location.isActive ? "" : " · work site inactive"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {assignment.isPrimary ? (
                  <StatusPill tone="good">Primary</StatusPill>
                ) : null}
                <StatusPill
                  tone={assignment.status === "ACTIVE" ? "info" : "muted"}
                >
                  {assignment.status === "ACTIVE" ? "Active" : "Inactive"}
                </StatusPill>

                {canManage ? (
                  <button
                    type="button"
                    className="rounded-2xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
                    disabled={busy}
                    onClick={() => {
                      setEditing(assignment.locationId);
                      setEditFrom(assignment.validFrom?.slice(0, 10) ?? "");
                      setEditTo(assignment.validTo?.slice(0, 10) ?? "");
                      setError(null);
                    }}
                  >
                    Edit validity
                  </button>
                ) : null}

                {canManage && !assignment.isPrimary ? (
                  <button
                    type="button"
                    className="rounded-2xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void setPrimary(assignment.locationId)}
                  >
                    Make primary
                  </button>
                ) : null}

                {canManage ? (
                  <button
                    type="button"
                    className="rounded-2xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          assignment.isPrimary
                            ? `Remove ${assignment.location.name}? It is this employee's primary work site, so another authorised site will become primary.`
                            : `Remove ${assignment.location.name}? The employee will no longer be able to record attendance there.`,
                        )
                      ) {
                        void removeWorkSite(assignment.locationId);
                      }
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              {editing === assignment.locationId ? (
                <div className="grid w-full gap-4 rounded-[18px] border border-border bg-white/70 p-4 sm:grid-cols-3">
                  <div>
                    <label
                      className="block text-sm font-medium text-foreground"
                      htmlFor={`valid-from-${assignment.id}`}
                    >
                      Valid from
                    </label>
                    <input
                      id={`valid-from-${assignment.id}`}
                      type="date"
                      className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                      value={editFrom}
                      onChange={(event) => setEditFrom(event.target.value)}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium text-foreground"
                      htmlFor={`valid-to-${assignment.id}`}
                    >
                      Valid to
                    </label>
                    <input
                      id={`valid-to-${assignment.id}`}
                      type="date"
                      className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                      value={editTo}
                      onChange={(event) => setEditTo(event.target.value)}
                    />
                  </div>
                  <div className="flex items-end gap-3">
                    <button
                      type="button"
                      className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void saveValidity(assignment.locationId)}
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">
          No work site assignments yet.
        </p>
      )}

      {error ? (
        <p className="mt-4 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {canManage && adding ? (
        <div className="mt-4 grid gap-4 rounded-[18px] border border-border bg-white/70 p-4 sm:grid-cols-3">
          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="work-site-location"
            >
              Work site
            </label>
            <select
              id="work-site-location"
              className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">Select…</option>
              {addable.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="work-site-valid-from"
            >
              Valid from (optional)
            </label>
            <input
              id="work-site-valid-from"
              type="date"
              className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="work-site-valid-to"
            >
              Valid to (optional)
            </label>
            <input
              id="work-site-valid-to"
              type="date"
              className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={validTo}
              onChange={(event) => setValidTo(event.target.value)}
            />
          </div>

          <div className="flex gap-3 sm:col-span-3">
            <button
              type="button"
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
              disabled={busy || !locationId}
              onClick={() => void addWorkSite()}
            >
              {busy ? "Adding…" : "Add work site"}
            </button>
            <button
              type="button"
              className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>

          {addable.length === 0 ? (
            <p className="text-sm text-muted sm:col-span-3">
              Every active work site is already assigned to this employee.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
