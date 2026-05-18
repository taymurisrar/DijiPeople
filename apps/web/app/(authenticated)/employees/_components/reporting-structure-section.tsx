import Link from "next/link";
import {
  ReportingNode,
  ReportingStructureModal,
  ReportingTreeNode,
} from "./reporting-structure-modal";

type ReportingStructureSectionProps = {
  directReports: ReportingNode[];
  employeeId: string;
  managerChain: ReportingNode[];
  fullTree: ReportingTreeNode[];
  canEdit?: boolean;
};

export function ReportingStructureSection({
  directReports,
  employeeId,
  managerChain,
  fullTree,
  canEdit = false,
}: ReportingStructureSectionProps) {
  return (
    <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Reporting Structure
        </p>
        <ReportingStructureModal
          currentEmployeeId={employeeId}
          fullTree={fullTree}
        />
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <section className="grid content-start gap-3">
          <h4 className="text-sm font-semibold text-foreground">
            Reporting line
          </h4>
          {managerChain.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-white/80 px-4 py-4 text-sm text-muted">
              This employee is at the top of the reporting line.
            </p>
          ) : (
            <div className="grid h-fit gap-3">
              {managerChain.map((manager) => (
                <EmployeeLink key={manager.employeeId} node={manager} />
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
              {directReports.map((report) => (
                <EmployeeLink key={report.employeeId} node={report} />
              ))}
            </div>
          )}
        </section>
      </div>

      {canEdit ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-white/70 px-4 py-4 text-sm">
          <Link
            className="font-medium text-accent hover:text-accent-strong"
            href={`/employees/${employeeId}/edit`}
          >
            Update employee record
          </Link>
        </div>
      ) : null}
    </article>
  );
}

function EmployeeLink({ node }: { node: ReportingNode }) {
  return (
    <Link
      className="rounded-2xl border border-border bg-white/80 px-4 py-4 transition hover:border-accent/30"
      href={`/employees/${node.employeeId}`}
    >
      <p className="font-medium text-foreground">{node.displayName}</p>
      <p className="mt-1 text-sm text-muted">
        {[node.jobTitle, node.department].filter(Boolean).join(" • ") ||
          "Role not set"}
      </p>
    </Link>
  );
}
