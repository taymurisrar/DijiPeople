import Link from "next/link";
import {
  EmployeeHierarchyNode,
  EmployeeHierarchyPreview,
} from "../types";

type ReportingStructureSectionProps = {
  directReports: EmployeeHierarchyPreview[];
  employeeId: string;
  managerChain: EmployeeHierarchyNode[];
};

export function ReportingStructureSection({
  directReports,
  employeeId,
  managerChain,
}: ReportingStructureSectionProps) {
  return (
    <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        Reporting Structure
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <section className="grid gap-3 content-start">
          <h4 className="text-sm font-semibold text-foreground">
            Reporting line
          </h4>
          {managerChain.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-white/80 px-4 py-4 text-sm text-muted">
              This employee is currently at the top of their reporting line.
            </p>
          ) : (
            <div className="grid gap-3 h-fit">
              {managerChain.map((manager, index) => (
                <Link
                  key={manager.id}
                  className="rounded-2xl border border-border bg-white/80 px-4 py-4 transition hover:border-accent/30"
                  href={`/dashboard/employees/${manager.id}`}
                >
                  {/* <p className="text-xs uppercase tracking-[0.18em] text-muted">
                    Level {index + 1}
                  </p> */}
                  <p className="mt-2 font-medium text-foreground">
                    {manager.fullName}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {manager.employeeCode}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-foreground">
              Direct reports
            </h4>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
              {directReports.length}
            </span>
          </div>

          {directReports.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-white/80 px-4 py-4 text-sm text-muted">
              No one currently reports directly to this employee.
            </p>
          ) : (
            <div className="grid gap-3">
              {directReports.map((directReport) => (
                <Link
                  key={directReport.id}
                  className="rounded-2xl border border-border bg-white/80 px-4 py-4 transition hover:border-accent/30"
                  href={`/dashboard/employees/${directReport.id}`}
                >
                  <p className="font-medium text-foreground">
                    {directReport.fullName}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {[directReport.employeeCode, directReport.designation?.name || "No designation"].join(" · ")}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border bg-white/70 px-4 py-4 text-sm text-muted">
        The current employee sits between the manager chain above and the direct
        reports below.
        <Link
          className="ml-2 font-medium text-accent hover:text-accent-strong"
          href={`/dashboard/employees/${employeeId}/edit`}
        >
          Update employee record
        </Link>
      </div>
    </article>
  );
}
