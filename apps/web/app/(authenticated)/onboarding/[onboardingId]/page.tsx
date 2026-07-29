import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  UserRound,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { apiRequestJson } from "@/lib/server-api";
import { ConvertToEmployeeButton } from "../_components/convert-to-employee-button";
import {
  OnboardingStatusBadge,
  OnboardingTaskStatusBadge,
} from "../_components/onboarding-status-badge";
import { OnboardingTaskProgressForm } from "../_components/onboarding-task-progress-form";
import type { EmployeeOnboardingRecord } from "../types";
import type { UserListItem, UserListResponse } from "../../users/types";

type OnboardingDetailPageProps = {
  params: Promise<{
    onboardingId: string;
  }>;
};

export default async function OnboardingDetailPage({
  params,
}: OnboardingDetailPageProps) {
  const { onboardingId } = await params;
  const [onboarding, users] = await Promise.all([
    apiRequestJson<EmployeeOnboardingRecord>(`/onboarding/${onboardingId}`),
    apiRequestJson<unknown>("/users?pageSize=200").catch(() => ({
      items: [],
    })),
  ]);

  const percent = clampPercent(onboarding.progress.percent);
  const subjectName =
    onboarding.employee?.fullName ||
    onboarding.candidate?.fullName ||
    "New hire";
  const subjectMeta = onboarding.employee?.employeeCode
    ? `Employee ${onboarding.employee.employeeCode}`
    : onboarding.candidate?.email || "Candidate onboarding";
  const taskCountLabel = `${onboarding.progress.completedTasks}/${onboarding.progress.totalTasks}`;
  const requiredCountLabel = `${onboarding.progress.completedRequiredTasks}/${onboarding.progress.requiredTasks}`;
  const dueDateLabel = formatDate(onboarding.dueDate);
  const templateLabel = onboarding.template?.name || "No template";
  const draftEmployee = onboarding.employee?.isDraftProfile
    ? onboarding.employee
    : onboarding.candidate?.draftEmployee;
  const blockers = onboarding.readiness.blockers;
  const pendingRequiredTasks = onboarding.tasks.filter(
    (task) => task.isRequired && task.status !== "COMPLETED",
  );
  const nextTask = pendingRequiredTasks[0] ?? null;
  const nextStep = getNextStep(onboarding, nextTask);
  const pageTitle = buildOnboardingTitle(onboarding.title, subjectName);
  const overdueCount = onboarding.tasks.filter(isOverdueTask).length;
  const unassignedCount = onboarding.tasks.filter(
    (task) => !task.assignedUserId,
  ).length;
  const userOptions = getUserItems(users).map((user) => ({
    value: user.id,
    label: user.fullName || user.email,
  }));

  return (
    <main className="grid gap-5">
      <section className="rounded-[24px] border border-border bg-surface p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            href="/onboarding"
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(238,247,244,0.92))] shadow-lg">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                Onboarding
              </p>
              <OnboardingStatusBadge status={onboarding.status} />
            </div>

            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px] lg:items-end">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">
                  {pageTitle}
                </h1>
                <p className="mt-2 text-sm text-muted">
                  {subjectName} / {subjectMeta}
                </p>
              </div>

              <div className="rounded-[18px] border border-border bg-white/85 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">
                  Completion
                </p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <p className="text-2xl font-semibold text-foreground">
                    {percent}%
                  </p>
                  <p className="pb-1 text-sm text-muted">
                    {taskCountLabel} tasks
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-accent-soft">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricItem label="Required" value={requiredCountLabel} />
              <MetricItem label="Due" value={dueDateLabel} />
              <MetricItem label="Unassigned" value={String(unassignedCount)} />
              <MetricItem label="Overdue" value={String(overdueCount)} />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <MetricItem label="Template" value={templateLabel} />
              <MetricItem
                label="Draft profile"
                value={draftEmployee ? "Created" : "Not created"}
              />
            </div>
          </div>

          <aside className="rounded-[24px] border border-border bg-white/90 p-5">
            <div className="flex items-start gap-3">
              <span className={nextStep.toneClass}>
                {nextStep.ready ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <AlertTriangle className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">
                  Next step
                </p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">
                  {nextStep.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {nextStep.description}
                </p>
              </div>
            </div>

            {blockers.length > 0 ? (
              <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                  Blocking conversion
                </p>
                <ul className="mt-2 grid gap-1.5 text-sm text-amber-800">
                  {blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-4 grid gap-2">
              {onboarding.candidate ? (
                <Button
                  href={`/recruitment/candidates/${onboarding.candidate.id}`}
                  variant="secondary"
                  fullWidth
                  leftIcon={<UserRound className="h-4 w-4" />}
                >
                  Candidate
                </Button>
              ) : null}
              {!onboarding.employee ? (
                <ConvertToEmployeeButton
                  canConvert={onboarding.readiness.isReadyForConversion}
                  onboardingId={onboarding.id}
                />
              ) : (
                <Button
                  href={`/employees/${onboarding.employee.id}`}
                  variant="success-soft"
                  fullWidth
                >
                  Open employee record
                </Button>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted">
              Checklist
            </p>
            <h3 className="mt-1 text-2xl font-semibold text-foreground">
              Complete tasks and clear blockers
            </h3>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border border-border bg-white px-3 py-1 text-muted">
              {onboarding.progress.totalTasks} total
            </span>
            <span className="rounded-full border border-border bg-white px-3 py-1 text-muted">
              {onboarding.progress.requiredTasks} required
            </span>
            <span className="rounded-full border border-border bg-white px-3 py-1 text-muted">
              {unassignedCount} unassigned
            </span>
          </div>
        </div>

        <div className="divide-y divide-border">
          {onboarding.tasks.length > 0 ? (
            onboarding.tasks.map((task, index) => (
              <details key={task.id} className="group bg-white/80">
                <summary className="grid cursor-pointer list-none gap-3 px-5 py-4 transition hover:bg-accent-soft/20 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                        Task {index + 1}
                      </span>
                      {task.isRequired ? (
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-strong">
                          Required
                        </span>
                      ) : null}
                      <span className="text-xs text-muted">
                      {formatChecklistGroup(task.checklistGroup)}
                      </span>
                      {isOverdueTask(task) ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700">
                          Overdue
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-base font-semibold text-foreground">
                      {task.title}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {task.assignedUser?.fullName || "Unassigned"} / Due{" "}
                      {formatDate(task.dueDate)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <OnboardingTaskStatusBadge status={task.status} />
                    <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted">
                      Review
                    </span>
                  </div>
                </summary>

                <div className="grid gap-4 border-t border-border bg-surface px-5 py-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="grid gap-3 text-sm">
                    <InfoBlock
                      label="Description"
                      value={task.description || "No description provided."}
                    />
                    <InfoBlock
                      label="Latest note"
                      value={task.notes || "No note added yet."}
                    />
                  </div>
                  <div>
                    <OnboardingTaskProgressForm
                      onboardingId={onboarding.id}
                      userOptions={userOptions}
                      task={task}
                    />
                  </div>
                </div>
              </details>
            ))
          ) : (
            <div className="px-5 py-8 text-sm text-muted">
              This onboarding flow does not have any tasks yet.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-border bg-white/85 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function getUserItems(value: unknown): UserListItem[] {
  if (Array.isArray(value)) return value;
  if (!isObjectRecord(value)) return [];

  if (Array.isArray(value.items)) return value.items as UserListItem[];
  if (Array.isArray(value.users)) return value.users as UserListItem[];

  return [];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function buildOnboardingTitle(savedTitle: string, subjectName: string) {
  const normalizedSavedTitle = savedTitle.trim().toLowerCase();
  const normalizedSubjectName = subjectName.trim().toLowerCase();

  if (
    normalizedSubjectName &&
    normalizedSavedTitle === `${normalizedSubjectName} onboarding`
  ) {
    return "New hire onboarding";
  }

  return savedTitle || "New hire onboarding";
}

function isOverdueTask(task: EmployeeOnboardingRecord["tasks"][number]) {
  if (!task.dueDate || task.status === "COMPLETED") return false;
  const dueDate = new Date(task.dueDate);
  if (Number.isNaN(dueDate.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  return dueDate.getTime() < today.getTime();
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 leading-6 text-foreground">{value}</p>
    </div>
  );
}

function getNextStep(
  onboarding: EmployeeOnboardingRecord,
  nextTask: EmployeeOnboardingRecord["tasks"][number] | null,
) {
  if (onboarding.readiness.isReadyForConversion) {
    return {
      ready: true,
      title: "Convert to employee",
      description:
        "All required checklist items are complete. Convert this onboarding record when HR is ready.",
      toneClass:
        "mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700",
    };
  }

  if (nextTask) {
    return {
      ready: false,
      title: nextTask.title,
      description: `Update this required task first. Due ${formatDate(
        nextTask.dueDate,
      )}.`,
      toneClass:
        "mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700",
    };
  }

  return {
    ready: false,
    title: "Resolve conversion blockers",
    description:
      "Checklist tasks are complete, but linked candidate or draft employee details still need attention.",
    toneClass:
      "mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700",
  };
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
