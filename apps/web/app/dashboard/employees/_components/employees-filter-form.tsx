import { EmployeeEmploymentStatus, EmployeeListItem } from "../types";

const employeeStatuses: EmployeeEmploymentStatus[] = [
  "Active",
  "PROBATION",
  "NOTICE",
  "TERMINATED",
];

type EmployeesFilterFormProps = {
  defaultValues: {
    search: string;
    employmentStatus: string;
    reportingManagerEmployeeId: string;
  };
  managerOptions: EmployeeListItem[];
};

export function EmployeesFilterForm({
  defaultValues,
  managerOptions,
}: EmployeesFilterFormProps) {
  return (
    <form className="grid gap-4 rounded-[24px] border border-border bg-surface p-5 shadow-sm md:grid-cols-[1.3fr_0.8fr_1fr_auto]">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="search">
          Name or employee code
        </label>
        <input
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          defaultValue={defaultValues.search}
          id="search"
          name="search"
          placeholder="Search by name, code, or work email"
          type="text"
        />
      </div>

      <div className="space-y-2">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="employmentStatus"
        >
          Status
        </label>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          defaultValue={defaultValues.employmentStatus}
          id="employmentStatus"
          name="employmentStatus"
        >
          <option value="">All statuses</option>
          {employeeStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="reportingManagerEmployeeId"
        >
          Reporting manager
        </label>
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          defaultValue={defaultValues.reportingManagerEmployeeId}
          id="reportingManagerEmployeeId"
          name="reportingManagerEmployeeId"
        >
          <option value="">All reporting managers</option>
          {managerOptions.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.fullName} ({manager.employeeCode})
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-end gap-3">
        <button
          className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
          type="submit"
        >
          Apply
        </button>
        <a
          className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
          href="/dashboard/employees"
        >
          Reset
        </a>
      </div>
    </form>
  );
}
