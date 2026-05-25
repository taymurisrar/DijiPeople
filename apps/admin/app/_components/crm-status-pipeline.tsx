"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Lock,
  X,
} from "lucide-react";
import {
  getMissingPipelineFields,
  isPipelineFieldComplete,
  type PipelineFormState,
  type PipelineStage,
} from "@/app/_components/entity-pipeline-config";

export function CrmStatusPipeline({
  currentStatus,
  disabled = false,
  form,
  onFieldFocus,
  onStageChange,
  stages,
}: {
  currentStatus: string;
  disabled?: boolean;
  form: PipelineFormState;
  onFieldFocus?: (fieldKey: string) => void;
  onStageChange?: (stage: PipelineStage, missingFieldKeys: string[]) => void;
  stages: PipelineStage[];
}) {
  const [openStageKey, setOpenStageKey] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const currentIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.statusValue === currentStatus),
  );

  const openStage = useMemo(
    () => stages.find((stage) => stage.key === openStageKey),
    [openStageKey, stages],
  );

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if ((event.target as HTMLElement | null)?.closest("[data-pipeline-popover]")) {
        return;
      }
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenStageKey(null);
        setAnchorRect(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenStageKey(null);
        setAnchorRect(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!openStageKey) return;

    function updateAnchor() {
      const anchor = buttonRefs.current.get(openStageKey ?? "");
      if (anchor) setAnchorRect(anchor.getBoundingClientRect());
    }

    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [openStageKey]);

  return (
    <section
      className="relative z-20 overflow-visible rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm"
      ref={rootRef}
    >
      <div className="overflow-x-auto overflow-y-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="relative flex min-w-max items-center overflow-visible">
          {stages.map((stage, index) => {
            const requiredComplete = stage.requiredFields.filter((field) =>
              isPipelineFieldComplete(form[field.key]),
            ).length;
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isOpen = openStageKey === stage.key;
            const clickable = !disabled;

            return (
              <div
                className="relative flex min-w-[132px] flex-1 items-center overflow-visible"
                key={stage.key}
              >
                <button
                  aria-expanded={isOpen}
                  className={[
                    "group flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition focus:outline-none focus:ring-2 focus:ring-slate-950/15",
                    clickable
                      ? "cursor-pointer hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm"
                      : "cursor-not-allowed opacity-70",
                    isOpen ? "border-slate-200 bg-slate-50 shadow-sm" : "",
                  ].join(" ")}
                  disabled={!clickable}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setOpenStageKey((current) => {
                      const next = current === stage.key ? null : stage.key;
                      setAnchorRect(next ? rect : null);
                      return next;
                    });
                  }}
                  ref={(node) => {
                    if (node) {
                      buttonRefs.current.set(stage.key, node);
                    } else {
                      buttonRefs.current.delete(stage.key);
                    }
                  }}
                  type="button"
                >
                  <span
                    className={[
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                      isCompleted
                        ? "border-slate-950 bg-slate-950 text-white"
                        : isCurrent
                          ? "border-slate-950 bg-white text-slate-950 ring-4 ring-slate-950/10"
                          : "border-slate-300 bg-slate-50 text-slate-400",
                    ].join(" ")}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : isCurrent ? (
                      <Circle className="h-3 w-3 fill-current" />
                    ) : disabled ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={[
                        "block truncate text-[13px] font-semibold",
                        isCurrent
                          ? "text-slate-950"
                          : isCompleted
                            ? "text-slate-700"
                            : "text-slate-400",
                      ].join(" ")}
                    >
                      {stage.label}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {requiredComplete}/{stage.requiredFields.length} required
                    </span>
                  </span>
                </button>

                {index < stages.length - 1 ? (
                  <span
                    className={[
                      "mx-0.5 h-px w-5 shrink-0",
                      index < currentIndex ? "bg-slate-950" : "bg-slate-200",
                    ].join(" ")}
                  />
                ) : null}

                {isOpen && openStage && anchorRect ? (
                  <PipelineStagePopover
                    anchorRect={anchorRect}
                    current={isCurrent}
                    form={form}
                    onFieldFocus={onFieldFocus}
                    onClose={() => {
                      setOpenStageKey(null);
                      setAnchorRect(null);
                    }}
                    onStageChange={onStageChange}
                    stage={openStage}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PipelineStagePopover({
  anchorRect,
  current,
  form,
  onFieldFocus,
  onClose,
  onStageChange,
  stage,
}: {
  anchorRect: DOMRect;
  current: boolean;
  form: PipelineFormState;
  onFieldFocus?: (fieldKey: string) => void;
  onClose: () => void;
  onStageChange?: (stage: PipelineStage, missingFieldKeys: string[]) => void;
  stage: PipelineStage;
}) {
  const missing = getMissingPipelineFields(stage, form);
  const requiredComplete = stage.requiredFields.length - missing.length;
  const optionalFields = stage.optionalFields ?? [];
  const optionalComplete = optionalFields.filter((field) =>
    isPipelineFieldComplete(form[field.key]),
  ).length;
  if (typeof window === "undefined") return null;

  const availableWidth = window.innerWidth - 24;
  const width = availableWidth < 320 ? availableWidth : Math.min(360, availableWidth);
  const left = Math.min(
    Math.max(12, anchorRect.left + anchorRect.width / 2 - width / 2),
    Math.max(12, window.innerWidth - width - 12),
  );
  const spaceBelow = window.innerHeight - anchorRect.bottom - 12;
  const preferredMaxHeight = 420;
  const maxHeight = Math.min(preferredMaxHeight, Math.max(260, spaceBelow));
  const shouldFlip = spaceBelow < 260 && anchorRect.top > spaceBelow;
  const top = shouldFlip
    ? Math.max(12, anchorRect.top - Math.min(preferredMaxHeight, anchorRect.top - 12) - 8)
    : anchorRect.bottom + 6;
  const arrowLeft = anchorRect.left + anchorRect.width / 2 - left - 5;

  return createPortal(
    <div
      className="fixed z-[100] overflow-y-auto overscroll-contain rounded-xl border border-slate-200/90 bg-white p-3 text-sm shadow-[0_18px_45px_rgba(15,23,42,0.16)] ring-1 ring-slate-950/5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-pipeline-popover
      style={{ left, maxHeight, top, width }}
    >
      <span
        className={[
          "absolute h-2.5 w-2.5 rotate-45 border bg-white",
          shouldFlip
            ? "-bottom-[6px] border-l-0 border-t-0 border-slate-200/90"
            : "-top-[6px] border-b-0 border-r-0 border-slate-200/90",
        ].join(" ")}
        style={{ left: arrowLeft }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-950">
            {stage.label}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {stage.statusValue}
            {stage.subStatusValue ? ` / ${stage.subStatusValue}` : ""}
          </p>
        </div>
        <button
          aria-label="Close stage details"
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-950 px-2.5 py-2 text-white">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
            Required
          </div>
          <div className="mt-0.5 text-sm font-semibold">
            {requiredComplete}/{stage.requiredFields.length}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-slate-600">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Optional
          </div>
          <div className="mt-0.5 text-sm font-semibold">
            {optionalFields.length ? `${optionalComplete}/${optionalFields.length}` : "-"}
          </div>
        </div>
      </div>

      <PipelineStageFieldChecklist
        fields={stage.requiredFields}
        form={form}
        onFieldFocus={onFieldFocus}
        onClose={onClose}
        title="Required"
      />
      {optionalFields.length ? (
        <PipelineStageFieldChecklist
          fields={optionalFields}
          form={form}
          onFieldFocus={onFieldFocus}
          onClose={onClose}
          optional
          title="Optional"
        />
      ) : null}

      {missing.length ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-800">
          Complete missing required fields before moving to this stage.
        </p>
      ) : null}

      <button
        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        disabled={current}
        onClick={() => {
          onStageChange?.(stage, missing.map((field) => field.key));
          if (!missing.length) onClose();
        }}
        type="button"
      >
        {current ? "Current stage" : "Move to stage"}
        {!current ? <ChevronRight className="h-4 w-4" /> : null}
      </button>
    </div>,
    document.body,
  );
}

function PipelineStageFieldChecklist({
  fields,
  form,
  onFieldFocus,
  onClose,
  optional = false,
  title,
}: {
  fields: Array<{ key: string; label: string }>;
  form: PipelineFormState;
  onFieldFocus?: (fieldKey: string) => void;
  onClose: () => void;
  optional?: boolean;
  title: string;
}) {
  if (!fields.length) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <p
          className={[
            "text-[11px] font-semibold uppercase tracking-[0.12em]",
            optional ? "text-slate-400" : "text-slate-600",
          ].join(" ")}
        >
          {title}
        </p>
        <span className="text-[11px] text-slate-400">
          {optional ? "Helpful context" : "Needed to progress"}
        </span>
      </div>
      <div className="mt-2 space-y-1">
        {fields.map((field) => {
          const complete = isPipelineFieldComplete(form[field.key]);
          return (
            <button
              className={[
                "flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-slate-950/15",
                complete
                  ? "border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50"
                  : optional
                    ? "border-slate-100 bg-white hover:bg-slate-50"
                    : "border-amber-100 bg-amber-50/60 hover:bg-amber-50",
              ].join(" ")}
              key={field.key}
              onClick={() => {
                onFieldFocus?.(field.key);
                onClose();
              }}
              type="button"
            >
              <span
                className={[
                  "min-w-0 truncate text-sm",
                  optional ? "text-slate-500" : "text-slate-700",
                ].join(" ")}
              >
                {field.label}
              </span>
              <span
                className={[
                  "inline-flex shrink-0 items-center gap-1 text-xs font-semibold",
                  complete
                    ? "text-emerald-700"
                    : optional
                      ? "text-slate-400"
                      : "text-amber-700",
                ].join(" ")}
              >
                {complete ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5" />
                )}
                {complete ? "Done" : optional ? "Empty" : "Missing"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
