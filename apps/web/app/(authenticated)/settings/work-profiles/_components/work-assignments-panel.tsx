"use client";

import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  DateField,
  LookupField,
  SelectField,
  type LookupOption,
} from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import { isoFromDateInput } from "../_lib/work-profile-form";
import {
  workProfilesRequest,
  type EmployeeOption,
  type WorkAssignment,
  type WorkProfileListItem,
} from "../_lib/work-profiles-client";

type EmployeeSearchResponse = {
  items?: Array<{ id: string; fullName: string; employeeCode: string }>;
};

/**
 * Which employee holds which profile, and when. An assignment is never edited
 * or deleted: it is shortened by ending it, so what a profile meant on a given
 * day stays answerable (ADR-0030).
 */
export function WorkAssignmentsPanel({
  assignments,
  employees,
  onChanged,
  profiles,
}: {
  assignments: WorkAssignment[];
  employees: EmployeeOption[];
  onChanged: () => Promise<void>;
  profiles: WorkProfileListItem[];
}) {
  const [known, setKnown] = useState<Map<string, EmployeeOption>>(
    () => new Map(employees.map((e) => [e.id, e])),
  );
  const [options, setOptions] = useState<LookupOption[]>(() =>
    employees.map(toLookupOption),
  );
  const [assigning, setAssigning] = useState(false);
  const [ending, setEnding] = useState<WorkAssignment | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    try {
      const params = new URLSearchParams({ pageSize: "20" });
      if (query.trim()) params.set("search", query.trim());
      const response = await fetch(`/api/employees?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = (await response.json()) as EmployeeSearchResponse;
      const found = (body.items ?? []).map((item) => ({
        id: item.id,
        name: item.fullName,
        code: item.employeeCode,
      }));
      setKnown((previous) => {
        const next = new Map(previous);
        found.forEach((e) => next.set(e.id, e));
        return next;
      });
      setOptions(found.map(toLookupOption));
    } catch {
      // A failed search leaves the previous options in place.
    }
  }, []);

  const activeProfiles = useMemo(
    () =>
      profiles
        .filter((p) => p.isActive)
        .map((p) => ({ value: p.id, label: p.name })),
    [profiles],
  );

  const openAssign = () => {
    setError(null);
    setEmployeeId("");
    setProfileId("");
    setFrom("");
    setTo("");
    setAssigning(true);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
      return false;
    } finally {
      setBusy(false);
    }
    return true;
  };

  const assign = async () => {
    if (!employeeId || !profileId || !from) {
      setError("Choose an employee, a profile and a start date.");
      return;
    }
    if (to && to <= from) {
      setError("The end date must be after the start date.");
      return;
    }
    const ok = await run(async () => {
      await workProfilesRequest("/assignments", {
        method: "POST",
        body: {
          employeeId,
          profileId,
          effectiveFrom: isoFromDateInput(from),
          ...(to ? { effectiveTo: isoFromDateInput(to) } : {}),
        },
      });
    });
    if (ok) setAssigning(false);
  };

  const end = async () => {
    if (!ending || !endDate) {
      setError("Choose the date the assignment ends.");
      return;
    }
    const ok = await run(async () => {
      await workProfilesRequest(`/assignments/${ending.id}/end`, {
        method: "PATCH",
        body: { effectiveTo: isoFromDateInput(endDate) },
      });
    });
    if (ok) setEnding(null);
  };

  const columns: DataTableColumn<WorkAssignment>[] = [
    {
      key: "employee",
      header: "Employee",
      searchAccessor: (row) => known.get(row.employeeId)?.name ?? "",
      render: (row) => {
        const employee = known.get(row.employeeId);
        return employee ? (
          <div>
            <p className="font-medium text-foreground">{employee.name}</p>
            <p className="text-xs text-muted">{employee.code}</p>
          </div>
        ) : (
          <span className="text-muted">{row.employeeId.slice(0, 8)}</span>
        );
      },
    },
    {
      key: "profile",
      header: "Profile",
      searchAccessor: (row) => row.profile?.name ?? "",
      render: (row) => row.profile?.name ?? row.profileId.slice(0, 8),
    },
    {
      key: "from",
      header: "From",
      sortAccessor: (row) => row.effectiveFrom,
      sortable: true,
      render: (row) => formatDate(row.effectiveFrom),
    },
    {
      key: "to",
      header: "To",
      render: (row) =>
        row.effectiveTo ? (
          formatDate(row.effectiveTo)
        ) : (
          <StatusPill tone="good">Open-ended</StatusPill>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <Button
          onClick={() => {
            setError(null);
            setEndDate("");
            setEnding(row);
          }}
          size="xs"
          variant="outline"
        >
          End
        </Button>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openAssign}>
          Assign profile
        </Button>
      </div>

      <DataTable
        columns={columns}
        emptyState={
          <EmptyState
            action={<Button onClick={openAssign}>Assign profile</Button>}
            description="Assign a profile to an employee to say what their work is and how it is measured."
            title="No assignments yet"
          />
        }
        entityLogicalName="work-profile-assignments"
        getRowKey={(row) => row.id}
        rows={assignments}
        searchPlaceholder="Search assignments"
      />

      <Dialog
        busy={busy}
        footer={
          <>
            <Button onClick={() => setAssigning(false)} variant="secondary">
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void assign()}>
              Assign
            </Button>
          </>
        }
        onClose={() => setAssigning(false)}
        open={assigning}
        title="Assign a work profile"
      >
        <div className="grid gap-4">
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <LookupField
            label="Employee"
            onChange={setEmployeeId}
            onSearch={(query) => void search(query)}
            options={options}
            required
            value={employeeId}
          />
          <SelectField
            label="Profile"
            onChange={setProfileId}
            options={activeProfiles}
            required
            value={profileId}
          />
          <DateField label="Effective from" onChange={setFrom} required value={from} />
          <DateField label="Effective to" onChange={setTo} value={to} />
        </div>
      </Dialog>

      <Dialog
        busy={busy}
        footer={
          <>
            <Button onClick={() => setEnding(null)} variant="secondary">
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void end()}>
              End assignment
            </Button>
          </>
        }
        onClose={() => setEnding(null)}
        open={ending !== null}
        title="End assignment"
      >
        <div className="grid gap-4">
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <DateField label="Ends on" onChange={setEndDate} required value={endDate} />
        </div>
      </Dialog>
    </div>
  );
}

function toLookupOption(employee: EmployeeOption): LookupOption {
  return { id: employee.id, name: employee.name, code: employee.code };
}
