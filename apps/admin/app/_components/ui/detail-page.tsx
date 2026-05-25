import type { ReactNode } from "react";
import { CheckCircle2, Circle, Lock } from "lucide-react";

export function DetailPageShell({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

export function DetailHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              {eyebrow}
            </p>
          ) : null}

          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {title}
          </h1>

          {description ? (
            <div className="mt-2 text-sm leading-6 text-slate-600">
              {description}
            </div>
          ) : null}
        </div>

        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </section>
  );
}

export function CommandBar({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      {children}
    </section>
  );
}

export function SummaryCards({ children }: { children: ReactNode }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {children}
    </section>
  );
}

export function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>

      <div className="mt-2 text-lg font-semibold text-slate-950">{value}</div>

      {hint ? <div className="mt-2 text-sm text-slate-500">{hint}</div> : null}
    </article>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>

        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>

      {children}
    </section>
  );
}

export function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-sm font-medium text-slate-950">
        {value || "Not specified"}
      </div>
    </div>
  );
}

export type PipelineStageStatus =
  | "completed"
  | "current"
  | "locked"
  | "warning"
  | "pending";

export type PipelineStage = {
  key: string;
  label: string;
  description?: string;
  status?: PipelineStageStatus;
  requiredFields?: string[];
  completedFields?: string[];
  locked?: boolean;
};

export function StatusPipeline({
  stages,
  current,
}: {
  stages: PipelineStage[];
  current: string;
}) {
  const currentIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.key === current),
  );

  const getStageStatus = (
    stage: PipelineStage,
    index: number,
  ): PipelineStageStatus => {
    if (stage.locked) return "locked";
    if (stage.status) return stage.status;
    if (index < currentIndex) return "completed";
    if (index === currentIndex) return "current";
    return "pending";
  };

  return (
    <section className="w-full overflow-visible rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-[720px] items-start justify-center">
          {stages.map((stage, index) => {
            const status = getStageStatus(stage, index);
            const requiredFields = stage.requiredFields ?? [];
            const completedFields = stage.completedFields ?? [];

            const requiredCount = requiredFields.length;
            const completedCount = completedFields.length;

            const isCompleted = status === "completed";
            const isCurrent = status === "current";
            const isLocked = status === "locked";
            const isActive = isCompleted || isCurrent;

            const popoverId = `stage-required-fields-${stage.key}`;

            const circleClass = isCompleted
              ? "border-indigo-600 bg-indigo-600 text-white"
              : isCurrent
                ? "border-indigo-600 bg-white text-indigo-700 ring-4 ring-indigo-100"
                : isLocked
                  ? "border-slate-300 bg-slate-100 text-slate-400"
                  : "border-slate-300 bg-white text-slate-500";

            const lineClass =
              index < currentIndex
                ? "bg-indigo-600"
                : index === currentIndex
                  ? "bg-indigo-300"
                  : "bg-slate-200";

            return (
              <div key={stage.key} className="min-w-0 flex-1">
                <button
                  type="button"
                  popoverTarget={requiredCount > 0 ? popoverId : undefined}
                  className="w-full cursor-pointer text-left"
                >
                  <div className="flex items-center">
                    <div
                      className={[
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition",
                        circleClass,
                      ].join(" ")}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : isLocked ? (
                        <Lock className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </div>

                    {index < stages.length - 1 ? (
                      <div className={["h-1 flex-1", lineClass].join(" ")} />
                    ) : null}
                  </div>

                    <div className="mt-2 max-w-[180px] pr-4">
                    <div
                      className={[
                        "flex items-center gap-2 text-sm font-semibold",
                        isActive ? "text-indigo-700" : "text-slate-500",
                      ].join(" ")}
                    >
                      <span className="truncate">{stage.label}</span>

                      {!isCompleted && !isLocked ? (
                        <Circle className="h-3.5 w-3.5 shrink-0" />
                      ) : null}
                    </div>

                    {requiredCount > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {completedCount}/{requiredCount} completed
                      </p>
                    ) : null}
                  </div>
                </button>

                {requiredCount > 0 ? (
                  <div
                    id={popoverId}
                    popover="auto"
                    className="m-auto w-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl backdrop:bg-transparent"
                  >
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Required fields
                      </p>

                      <button
                        type="button"
                        popoverTarget={popoverId}
                        popoverTargetAction="hide"
                        className="rounded-full px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        ×
                      </button>
                    </div>

                    <div className="space-y-2">
                      {requiredFields.map((field) => {
                        const isFieldCompleted = completedFields.includes(field);

                        return (
                          <div
                            key={field}
                            className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 text-sm last:border-b-0 last:pb-0"
                          >
                            <span className="text-slate-700">{field}</span>

                            <span
                              className={[
                                "text-xs font-semibold",
                                isFieldCompleted
                                  ? "text-indigo-700"
                                  : "text-slate-400",
                              ].join(" ")}
                            >
                              {isFieldCompleted ? "Done" : "Missing"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
