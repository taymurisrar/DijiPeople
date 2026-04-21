import { RecruitmentStage } from "../types";

const stageStyles: Record<RecruitmentStage, string> = {
  APPLIED: "border-slate-200 bg-slate-50 text-slate-700",
  SCREENING: "border-indigo-200 bg-indigo-50 text-indigo-700",
  SHORTLISTED: "border-sky-200 bg-sky-50 text-sky-700",
  INTERVIEW: "border-amber-200 bg-amber-50 text-amber-700",
  FINAL_REVIEW: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  OFFER: "border-violet-200 bg-violet-50 text-violet-700",
  APPROVED: "border-cyan-200 bg-cyan-50 text-cyan-700",
  HIRED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ON_HOLD: "border-orange-200 bg-orange-50 text-orange-700",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-700",
  WITHDRAWN: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

export function RecruitmentStageBadge({ stage }: { stage: RecruitmentStage }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.12em] ${stageStyles[stage]}`}
    >
      {stage.replaceAll("_", " ")}
    </span>
  );
}
