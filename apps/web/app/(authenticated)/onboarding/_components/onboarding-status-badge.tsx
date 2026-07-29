import { OnboardingStatus, OnboardingTaskStatus } from "../types";

const onboardingStatusStyles: Record<OnboardingStatus, string> = {
  DRAFT: "border-slate-200 bg-slate-50 text-slate-700",
  NOT_STARTED: "border-slate-200 bg-slate-50 text-slate-700",
  IN_PROGRESS: "border-amber-200 bg-amber-50 text-amber-700",
  AWAITING_CANDIDATE_INPUT: "border-sky-200 bg-sky-50 text-sky-700",
  READY_FOR_CONVERSION: "border-violet-200 bg-violet-50 text-violet-700",
  BLOCKED: "border-rose-200 bg-rose-50 text-rose-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CANCELLED: "border-rose-200 bg-rose-50 text-rose-700",
};

const taskStatusStyles: Record<OnboardingTaskStatus, string> = {
  PENDING: "border-slate-200 bg-slate-50 text-slate-700",
  IN_PROGRESS: "border-amber-200 bg-amber-50 text-amber-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CANCELLED: "border-rose-200 bg-rose-50 text-rose-700",
};

export function OnboardingStatusBadge({ status }: { status: OnboardingStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.12em] ${onboardingStatusStyles[status]}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function OnboardingTaskStatusBadge({
  status,
}: {
  status: OnboardingTaskStatus;
}) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.12em] ${taskStatusStyles[status]}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
