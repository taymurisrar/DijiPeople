import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import {
  OnboardingStatusBadge,
  OnboardingTaskStatusBadge,
} from "../_components/onboarding-status-badge";
import { OnboardingTaskProgressForm } from "../_components/onboarding-task-progress-form";
import { ConvertToEmployeeButton } from "../_components/convert-to-employee-button";
import { EmployeeOnboardingRecord } from "../types";

type OnboardingDetailPageProps = {
  params: Promise<{
    onboardingId: string;
  }>;
};

export default async function OnboardingDetailPage({
  params,
}: OnboardingDetailPageProps) {
  const { onboardingId } = await params;
  const onboarding = await apiRequestJson<EmployeeOnboardingRecord>(
    `/onboarding/${onboardingId}`,
  );

  const percent = clampPercent(onboarding.progress.percent);
  const subjectName =
    onboarding.employee?.fullName ||
    onboarding.candidate?.fullName ||
    "New hire";

  const subjectMeta = onboarding.employee?.employeeCode
    ? `Employee code: ${onboarding.employee.employeeCode}`
    : onboarding.candidate
      ? "Candidate onboarding"
      : "New onboarding flow";

  const taskCountLabel = `${onboarding.progress.completedTasks}/${onboarding.progress.totalTasks}`;
  const requiredCountLabel = `${onboarding.progress.completedRequiredTasks}/${onboarding.progress.requiredTasks}`;
  const dueDateLabel = formatDate(onboarding.dueDate);
  const templateLabel = onboarding.template?.name || "No template";

  const completedTasks = onboarding.tasks.filter(
    (task) => task.status?.toLowerCase() === "completed",
  );
  const pendingTasks = onboarding.tasks.filter(
    (task) => task.status?.toLowerCase() !== "completed",
  );
  const nextImportantTasks = pendingTasks
    .filter((task) => task.isRequired)
    .slice(0, 3);

  return (
    <main className="grid gap-5">
      <section className="overflow-hidden rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(238,247,244,0.92))] shadow-lg">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-8">
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">
                  Onboarding workspace
                </p>
                <OnboardingStatusBadge status={onboarding.status} />
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
                  {onboarding.title}
                </h1>
                <p className="text-base text-muted">{subjectName}</p>
                <p className="text-sm text-muted">{subjectMeta}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Progress"
                value={`${percent}%`}
                helper={`${taskCountLabel} tasks done`}
              />
              <MetricCard
                label="Required items"
                value={requiredCountLabel}
                helper={
                  onboarding.progress.requiredTasks > 0
                    ? "Required checklist coverage"
                    : "No required items"
                }
              />
              <MetricCard
                label="Due date"
                value={dueDateLabel}
                helper={templateLabel}
              />
              <MetricCard
                label="Readiness"
                value={
                  onboarding.readiness.isReadyForConversion
                    ? "Ready"
                    : "Pending"
                }
                helper={
                  onboarding.readiness.isReadyForConversion
                    ? "Can be converted to employee"
                    : "Waiting on blockers"
                }
              />
            </div>

            <div className="rounded-[24px] border border-border bg-white/85 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted">
                    Overall completion
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {completedTasks.length} completed • {pendingTasks.length} remaining
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground">{percent}%</p>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-accent-soft">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          </div>

          <aside className="grid gap-4 self-start rounded-[24px] border border-border bg-white/88 p-5 shadow-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted">
                Quick actions
              </p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Related records
              </h2>
              <p className="mt-1 text-sm text-muted">
                Keep navigation tight and action-focused.
              </p>
            </div>

            <div className="rounded-[20px] border border-border bg-surface p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">
                Conversion readiness
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {onboarding.readiness.isReadyForConversion
                  ? "All required steps are completed."
                  : "Some required onboarding items are still open."}
              </p>

              {onboarding.readiness.blockers.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-border bg-white/80 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted">
                    Current blockers
                  </p>
                  <ul className="mt-2 space-y-2 text-sm text-muted">
                    {onboarding.readiness.blockers.map((blocker) => (
                      <li key={blocker} className="flex gap-2">
                        <span className="mt-[2px] text-foreground">•</span>
                        <span>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {!onboarding.employee ? (
              <ConvertToEmployeeButton
                canConvert={onboarding.readiness.isReadyForConversion}
                onboardingId={onboarding.id}
              />
            ) : null}

            <div className="grid gap-3">
              {onboarding.candidate ? (
                <Link
                  className="rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                  href={`/dashboard/recruitment/candidates/${onboarding.candidate.id}`}
                >
                  View candidate record
                </Link>
              ) : null}

              {onboarding.employee ? (
                <Link
                  className="rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                  href={`/dashboard/employees/${onboarding.employee.id}`}
                >
                  View employee record
                </Link>
              ) : null}
            </div>

            {nextImportantTasks.length > 0 ? (
              <div className="rounded-[20px] border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">
                  Next required tasks
                </p>
                <div className="mt-3 space-y-3">
                  {nextImportantTasks.map((task) => (
                    <div key={task.id} className="rounded-2xl bg-white/85 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          {task.title}
                        </p>
                        <OnboardingTaskStatusBadge status={task.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Due {formatDate(task.dueDate)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted">
                  Checklist
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-foreground">
                  Task progress
                </h3>
              </div>
              <div className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-muted">
                {onboarding.tasks.length} total tasks
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4 md:p-5">
            {onboarding.tasks.length > 0 ? (
              onboarding.tasks.map((task, index) => {
                const isCompleted =
                  task.status?.toLowerCase() === "completed";

                return (
                  <details
                    key={task.id}
                    className="group overflow-hidden rounded-[22px] border border-border bg-white/92 shadow-sm open:shadow-md"
                  >
                    <summary className="flex cursor-pointer list-none flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                            Task {index + 1}
                          </span>
                          {task.isRequired ? (
                            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-strong">
                              Required
                            </span>
                          ) : (
                            <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                              Optional
                            </span>
                          )}
                        </div>

                        <div className="space-y-1">
                          <p className="text-base font-semibold text-foreground">
                            {task.title}
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                            <span>
                              Assigned: {task.assignedUser?.fullName || "Unassigned"}
                            </span>
                            <span>Due: {formatDate(task.dueDate)}</span>
                            <span>
                              Group: {formatChecklistGroup(task.checklistGroup)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <OnboardingTaskStatusBadge status={task.status} />
                        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition group-open:rotate-0">
                          {isCompleted ? "Review" : "Update"}
                        </span>
                      </div>
                    </summary>

                    <div className="border-t border-border px-4 pb-4 pt-4">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                        <div className="space-y-3">
                          <InfoRow
                            label="Description"
                            value={task.description || "No task description."}
                          />
                          <InfoRow
                            label="Latest note"
                            value={task.notes || "No notes added yet."}
                          />
                        </div>

                        <div className="rounded-[20px] border border-border bg-surface p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-muted">
                            Update task
                          </p>
                          <div className="mt-3">
                            <OnboardingTaskProgressForm
                              onboardingId={onboarding.id}
                              task={task}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })
            ) : (
              <div className="rounded-[22px] border border-dashed border-border bg-white/70 p-6 text-sm text-muted">
                This onboarding flow does not have any tasks yet.
              </div>
            )}
          </div>
        </article>

        <aside className="grid gap-4 self-start">
          <article className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              Snapshot
            </p>
            <div className="mt-4 grid gap-3">
              <CompactInfoItem label="Template" value={templateLabel} />
              <CompactInfoItem label="Due date" value={dueDateLabel} />
              <CompactInfoItem label="Tasks complete" value={taskCountLabel} />
              <CompactInfoItem
                label="Required complete"
                value={requiredCountLabel}
              />
            </div>
          </article>

          <article className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              Guidance
            </p>
            <div className="mt-3 space-y-3 text-sm text-muted">
              <p>
                Keep required tasks updated first. That is what blocks employee
                conversion.
              </p>
              <p>
                Open only the task you are actively reviewing so the page stays
                short and easy to scan.
              </p>
            </div>
          </article>
        </aside>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <article className="rounded-[22px] border border-border bg-white/88 p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
      {helper ? <p className="mt-1 text-sm text-muted">{helper}</p> : null}
    </article>
  );
}

function CompactInfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-white/85 px-4 py-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-right text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-border bg-white/80 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatChecklistGroup(value?: string | null) {
  if (!value) return "General";
  return value.replaceAll("_", " ");
}

function clampPercent(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}