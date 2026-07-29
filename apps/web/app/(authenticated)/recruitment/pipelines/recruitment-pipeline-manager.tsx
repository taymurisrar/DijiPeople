"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  RecruitmentPipelineRecord,
  RecruitmentPipelineStageRecord,
  RecruitmentStage,
} from "../types";

const STAGE_OPTIONS: RecruitmentStage[] = [
  "APPLIED",
  "SCREENING",
  "SHORTLISTED",
  "INTERVIEW",
  "FINAL_REVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
  "ON_HOLD",
];

const DEFAULT_STAGES: RecruitmentPipelineStageRecord[] = [
  makeStage("APPLIED", "Applied", 10, "#2563eb"),
  makeStage("SCREENING", "Screening", 20, "#0891b2"),
  makeStage("SHORTLISTED", "Shortlisted", 30, "#7c3aed"),
  makeStage("INTERVIEW", "Interview", 40, "#ea580c"),
  makeStage("FINAL_REVIEW", "Final Review", 50, "#ca8a04"),
  makeStage("OFFER", "Offer", 60, "#16a34a"),
  makeStage("HIRED", "Hired", 70, "#047857", true),
  makeStage("REJECTED", "Rejected", 80, "#dc2626", true),
];

export function RecruitmentPipelineManager({
  initialPipelines,
}: {
  initialPipelines: RecruitmentPipelineRecord[];
}) {
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [selectedId, setSelectedId] = useState(initialPipelines[0]?.id ?? "new");
  const selectedPipeline = pipelines.find((item) => item.id === selectedId);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState(() =>
    selectedPipeline ? toFormState(selectedPipeline) : newPipelineState(),
  );

  const sortedStages = useMemo(
    () => [...form.stages].sort((left, right) => left.sortOrder - right.sortOrder),
    [form.stages],
  );

  function selectPipeline(pipelineId: string) {
    setSelectedId(pipelineId);
    const pipeline = pipelines.find((item) => item.id === pipelineId);
    setForm(pipeline ? toFormState(pipeline) : newPipelineState());
    setError(null);
  }

  async function savePipeline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Pipeline name is required.");
      return;
    }
    if (!form.stages.some((stage) => stage.isActive && stage.stageKey === "HIRED")) {
      setError("Pipeline must include an active Hired stage.");
      return;
    }

    setIsSaving(true);
    const isNew = selectedId === "new";
    const response = await fetch(
      isNew
        ? "/api/recruitment/pipelines"
        : `/api/recruitment/pipelines/${selectedId}`,
      {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          description: form.description.trim() || undefined,
          isDefault: form.isDefault,
          isActive: form.isActive,
          allowBackwardMove: form.allowBackwardMove,
          requireRejectReason: form.requireRejectReason,
          stages: form.stages.map((stage) => ({
            stageKey: stage.stageKey,
            label: stage.label,
            color: stage.color || undefined,
            sortOrder: stage.sortOrder,
            isTerminal: stage.isTerminal,
            isActive: stage.isActive,
          })),
        }),
      },
    );
    const payload = (await response.json()) as
      | RecruitmentPipelineRecord
      | { message?: string };

    setIsSaving(false);

    if (!response.ok || !("id" in payload)) {
      setError(
        "message" in payload && payload.message
          ? payload.message
          : "Unable to save recruitment pipeline.",
      );
      return;
    }

    setPipelines((current) => {
      const withoutUpdated = current.filter((item) => item.id !== payload.id);
      const normalized = payload.isDefault
        ? withoutUpdated.map((item) => ({ ...item, isDefault: false }))
        : withoutUpdated;
      return [payload, ...normalized].sort(sortPipelines);
    });
    setSelectedId(payload.id);
    setForm(toFormState(payload));
  }

  function updateStage(
    index: number,
    patch: Partial<RecruitmentPipelineStageRecord>,
  ) {
    setForm((current) => ({
      ...current,
      stages: current.stages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...patch } : stage,
      ),
    }));
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-[24px] border border-border bg-surface p-4 shadow-sm">
        <button
          type="button"
          onClick={() => selectPipeline("new")}
          className="mb-3 w-full rounded-[14px] bg-accent px-4 py-3 text-sm font-semibold text-white"
        >
          New pipeline
        </button>
        <div className="grid gap-2">
          {pipelines.map((pipeline) => (
            <button
              key={pipeline.id}
              type="button"
              onClick={() => selectPipeline(pipeline.id)}
              className={`rounded-[14px] border px-4 py-3 text-left text-sm transition ${
                selectedId === pipeline.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-white text-foreground hover:border-accent/30"
              }`}
            >
              <span className="font-semibold">{pipeline.name}</span>
              <span className="mt-1 block text-xs text-muted">
                {pipeline.isDefault ? "Default" : "Custom"} ·{" "}
                {pipeline.isActive ? "Active" : "Inactive"}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <form
        onSubmit={savePipeline}
        className="grid gap-5 rounded-[24px] border border-border bg-surface p-6 shadow-sm"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Pipeline name"
            value={form.name}
            onChange={(value) =>
              setForm((current) => ({ ...current, name: value }))
            }
          />
          <TextField
            label="Code"
            value={form.code}
            onChange={(value) =>
              setForm((current) => ({ ...current, code: value }))
            }
          />
          <label className="space-y-2 text-sm md:col-span-2">
            <span className="font-medium text-foreground">Description</span>
            <textarea
              className="min-h-24 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            label="Default pipeline"
            checked={form.isDefault}
            onChange={(checked) =>
              setForm((current) => ({ ...current, isDefault: checked }))
            }
          />
          <Toggle
            label="Active"
            checked={form.isActive}
            onChange={(checked) =>
              setForm((current) => ({ ...current, isActive: checked }))
            }
          />
          <Toggle
            label="Allow backward stage movement"
            checked={form.allowBackwardMove}
            onChange={(checked) =>
              setForm((current) => ({ ...current, allowBackwardMove: checked }))
            }
          />
          <Toggle
            label="Require rejection reason"
            checked={form.requireRejectReason}
            onChange={(checked) =>
              setForm((current) => ({
                ...current,
                requireRejectReason: checked,
              }))
            }
          />
        </div>

        <div className="rounded-[20px] border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h4 className="text-lg font-semibold text-foreground">Stages</h4>
              <p className="text-sm text-muted">
                Ordered stages drive application board movement and validation.
              </p>
            </div>
            <button
              type="button"
              className="rounded-[12px] border border-border px-3 py-2 text-sm font-semibold"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  stages: [
                    ...current.stages,
                    makeStage("APPLIED", "New Stage", current.stages.length * 10 + 10),
                  ],
                }))
              }
            >
              Add stage
            </button>
          </div>
          <div className="grid gap-3 p-5">
            {sortedStages.map((stage) => {
              const index = form.stages.findIndex((item) => item.id === stage.id);
              return (
                <div
                  key={stage.id}
                  className="grid gap-3 rounded-[16px] border border-border bg-surface p-4 md:grid-cols-[150px_minmax(0,1fr)_120px_110px_110px]"
                >
                  <select
                    className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
                    value={stage.stageKey}
                    onChange={(event) =>
                      updateStage(index, {
                        stageKey: event.target.value as RecruitmentStage,
                      })
                    }
                  >
                    {STAGE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
                    value={stage.label}
                    onChange={(event) =>
                      updateStage(index, { label: event.target.value })
                    }
                  />
                  <input
                    className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
                    type="number"
                    value={stage.sortOrder}
                    onChange={(event) =>
                      updateStage(index, {
                        sortOrder: Number(event.target.value) || 0,
                      })
                    }
                  />
                  <Toggle
                    compact
                    label="Terminal"
                    checked={stage.isTerminal}
                    onChange={(checked) =>
                      updateStage(index, { isTerminal: checked })
                    }
                  />
                  <Toggle
                    compact
                    label="Active"
                    checked={stage.isActive}
                    onChange={(checked) =>
                      updateStage(index, { isActive: checked })
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>

        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSaving}
          className="justify-self-start rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
        >
          {isSaving ? "Saving..." : "Save pipeline"}
        </button>
      </form>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Toggle({
  checked,
  compact,
  label,
  onChange,
}: {
  checked: boolean;
  compact?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-3 rounded-[16px] border border-border bg-white ${
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="font-medium text-foreground">{label}</span>
    </label>
  );
}

function toFormState(pipeline: RecruitmentPipelineRecord) {
  return {
    name: pipeline.name,
    code: pipeline.code ?? "",
    description: pipeline.description ?? "",
    isDefault: pipeline.isDefault,
    isActive: pipeline.isActive,
    allowBackwardMove: pipeline.allowBackwardMove,
    requireRejectReason: pipeline.requireRejectReason,
    stages: pipeline.stages.length ? pipeline.stages : DEFAULT_STAGES,
  };
}

function newPipelineState() {
  return {
    name: "",
    code: "",
    description: "",
    isDefault: false,
    isActive: true,
    allowBackwardMove: true,
    requireRejectReason: true,
    stages: DEFAULT_STAGES,
  };
}

function makeStage(
  stageKey: RecruitmentStage,
  label: string,
  sortOrder: number,
  color = "#64748b",
  isTerminal = false,
): RecruitmentPipelineStageRecord {
  return {
    id: `${stageKey}-${sortOrder}-${Math.random().toString(36).slice(2)}`,
    stageKey,
    label,
    color,
    sortOrder,
    isTerminal,
    isActive: true,
  };
}

function sortPipelines(
  left: RecruitmentPipelineRecord,
  right: RecruitmentPipelineRecord,
) {
  return Number(right.isDefault) - Number(left.isDefault) || left.name.localeCompare(right.name);
}
