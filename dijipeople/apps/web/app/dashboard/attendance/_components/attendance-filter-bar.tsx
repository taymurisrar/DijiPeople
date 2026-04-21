"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  ATTENDANCE_MODE_OPTIONS,
  ATTENDANCE_SOURCE_OPTIONS,
  ATTENDANCE_STATUS_OPTIONS,
  AttendanceLocationOption,
  TeamEmployeeOption,
} from "../types";

type AttendanceFilterBarProps = {
  basePath: string;
  employees?: TeamEmployeeOption[];
  locations?: AttendanceLocationOption[];
  showEmployee?: boolean;
  showSource?: boolean;
};

export function AttendanceFilterBar({
  basePath,
  employees = [],
  locations = [],
  showEmployee = false,
  showSource = false,
}: AttendanceFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState(() => ({
    search: searchParams.get("search") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    status: searchParams.get("status") ?? "",
    attendanceMode: searchParams.get("attendanceMode") ?? "",
    source: searchParams.get("source") ?? "",
    employeeId: searchParams.get("employeeId") ?? "",
    officeLocationId: searchParams.get("officeLocationId") ?? "",
    sortField: searchParams.get("sortField") ?? "date",
    sortDirection: searchParams.get("sortDirection") ?? "desc",
    pageSize: searchParams.get("pageSize") ?? "20",
  }));

  const view = useMemo(() => searchParams.get("view") ?? "week", [searchParams]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    params.set("view", view);

    Object.entries(form).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    router.push(`${basePath}?${params.toString()}`);
  }

  function handleReset() {
    router.push(`${basePath}?view=${view}`);
  }

  return (
    <form
      className="grid gap-3 rounded-[24px] border border-border bg-surface p-5 shadow-sm md:grid-cols-2 xl:grid-cols-5"
      onSubmit={handleSubmit}
    >
      <input
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 xl:col-span-2"
        onChange={(event) =>
          setForm((current) => ({ ...current, search: event.target.value }))
        }
        placeholder="Search employee, code, company, or note..."
        value={form.search}
      />

      <input
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) =>
          setForm((current) => ({ ...current, dateFrom: event.target.value }))
        }
        type="date"
        value={form.dateFrom}
      />
      <input
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) =>
          setForm((current) => ({ ...current, dateTo: event.target.value }))
        }
        type="date"
        value={form.dateTo}
      />
      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) =>
          setForm((current) => ({ ...current, status: event.target.value }))
        }
        value={form.status}
      >
        <option value="">All statuses</option>
        {ATTENDANCE_STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {formatValue(status)}
          </option>
        ))}
      </select>

      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) =>
          setForm((current) => ({
            ...current,
            attendanceMode: event.target.value,
          }))
        }
        value={form.attendanceMode}
      >
        <option value="">All modes</option>
        {ATTENDANCE_MODE_OPTIONS.map((mode) => (
          <option key={mode} value={mode}>
            {formatValue(mode)}
          </option>
        ))}
      </select>

      {showSource ? (
        <select
          className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) =>
            setForm((current) => ({ ...current, source: event.target.value }))
          }
          value={form.source}
        >
          <option value="">All sources</option>
          {ATTENDANCE_SOURCE_OPTIONS.map((source) => (
            <option key={source} value={source}>
              {formatValue(source)}
            </option>
          ))}
        </select>
      ) : null}

      {showEmployee ? (
        <select
          className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) =>
            setForm((current) => ({ ...current, employeeId: event.target.value }))
          }
          value={form.employeeId}
        >
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName}
            </option>
          ))}
        </select>
      ) : null}

      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) =>
          setForm((current) => ({
            ...current,
            officeLocationId: event.target.value,
          }))
        }
        value={form.officeLocationId}
      >
        <option value="">All locations</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>

      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) =>
          setForm((current) => ({ ...current, sortField: event.target.value }))
        }
        value={form.sortField}
      >
        <option value="date">Sort: Date</option>
        <option value="employeeName">Sort: Employee</option>
        <option value="checkIn">Sort: Check in</option>
        <option value="checkOut">Sort: Check out</option>
        <option value="status">Sort: Status</option>
      </select>

      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) =>
          setForm((current) => ({
            ...current,
            sortDirection: event.target.value,
          }))
        }
        value={form.sortDirection}
      >
        <option value="desc">Newest first</option>
        <option value="asc">Oldest first</option>
      </select>

      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) =>
          setForm((current) => ({ ...current, pageSize: event.target.value }))
        }
        value={form.pageSize}
      >
        <option value="10">10 rows</option>
        <option value="20">20 rows</option>
        <option value="50">50 rows</option>
      </select>

      <div className="flex gap-3 xl:col-span-5">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
          type="submit"
        >
          Apply filters
        </button>
        <button
          className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
          onClick={handleReset}
          type="button"
        >
          Reset
        </button>
      </div>
    </form>
  );
}

function formatValue(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
