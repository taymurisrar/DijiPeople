"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type FilterOption = {
  id: string;
  label: string;
};

type TimesheetFilterBarProps = {
  basePath: string;
  employees?: FilterOption[];
  managers?: FilterOption[];
  departments?: FilterOption[];
  businessUnits?: FilterOption[];
  showEmployee?: boolean;
  showManager?: boolean;
};

export function TimesheetFilterBar({
  basePath,
  departments = [],
  businessUnits = [],
  employees = [],
  managers = [],
  showEmployee = false,
  showManager = false,
}: TimesheetFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState(() => ({
    year: searchParams.get("year") ?? String(new Date().getFullYear()),
    month: searchParams.get("month") ?? String(new Date().getMonth() + 1),
    status: searchParams.get("status") ?? "",
    employeeId: searchParams.get("employeeId") ?? "",
    managerEmployeeId: searchParams.get("managerEmployeeId") ?? "",
    departmentId: searchParams.get("departmentId") ?? "",
    businessUnitId: searchParams.get("businessUnitId") ?? "",
    sortField: searchParams.get("sortField") ?? "yearMonth",
    sortDirection: searchParams.get("sortDirection") ?? "desc",
    pageSize: searchParams.get("pageSize") ?? "12",
  }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    Object.entries(form).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    params.set("page", "1");
    router.push(`${basePath}?${params.toString()}`);
  }

  function refresh() {
    router.refresh();
  }

  return (
    <form
      className="grid gap-3 rounded-[24px] border border-border bg-surface p-5 shadow-sm md:grid-cols-2 xl:grid-cols-6"
      onSubmit={handleSubmit}
    >
      <input
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        max={2100}
        min={2000}
        onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))}
        type="number"
        value={form.year}
      />
      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => setForm((current) => ({ ...current, month: event.target.value }))}
        value={form.month}
      >
        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
          <option key={month} value={month}>
            {monthLabel(month)}
          </option>
        ))}
      </select>
      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => setForm((current) => ({ ...current, businessUnitId: event.target.value }))}
        value={form.businessUnitId}
      >
        <option value="">All business units</option>
        {businessUnits.map((businessUnit) => (
          <option key={businessUnit.id} value={businessUnit.id}>
            {businessUnit.label}
          </option>
        ))}
      </select>
      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
        value={form.status}
      >
        <option value="">All statuses</option>
        <option value="DRAFT">Draft</option>
        <option value="SUBMITTED">Submitted</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
      </select>
      {showEmployee ? (
        <select
          className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}
          value={form.employeeId}
        >
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.label}
            </option>
          ))}
        </select>
      ) : null}
      {showManager ? (
        <select
          className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) => setForm((current) => ({ ...current, managerEmployeeId: event.target.value }))}
          value={form.managerEmployeeId}
        >
          <option value="">All managers</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.label}
            </option>
          ))}
        </select>
      ) : null}
      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))}
        value={form.departmentId}
      >
        <option value="">All departments</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.label}
          </option>
        ))}
      </select>
      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => setForm((current) => ({ ...current, sortField: event.target.value }))}
        value={form.sortField}
      >
        <option value="yearMonth">Sort: Month</option>
        <option value="employee">Sort: Employee</option>
        <option value="status">Sort: Status</option>
        <option value="updatedAt">Sort: Updated</option>
      </select>
      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => setForm((current) => ({ ...current, sortDirection: event.target.value }))}
        value={form.sortDirection}
      >
        <option value="desc">Descending</option>
        <option value="asc">Ascending</option>
      </select>
      <select
        className="rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => setForm((current) => ({ ...current, pageSize: event.target.value }))}
        value={form.pageSize}
      >
        <option value="12">12 rows</option>
        <option value="25">25 rows</option>
        <option value="50">50 rows</option>
      </select>
      <div className="flex flex-wrap gap-3 xl:col-span-6">
        <button className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white" type="submit">
          Apply filters
        </button>
        <button
          className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
          onClick={() => router.push(basePath)}
          type="button"
        >
          Reset
        </button>
        <button
          className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
          onClick={refresh}
          type="button"
        >
          Refresh
        </button>
      </div>
    </form>
  );
}

function monthLabel(month: number) {
  return new Date(2026, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
  });
}
