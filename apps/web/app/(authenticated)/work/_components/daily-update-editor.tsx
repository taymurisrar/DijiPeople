"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { DateField, TextAreaField, TextField } from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import {
  DAILY_UPDATE_SECTIONS,
  SECTION_LABELS,
  STATUS_LABELS,
  buildDraftPayload,
  buildSavePayload,
  dateInputFor,
  groupBySection,
  isCorrection,
  isEvidenceBacked,
  statusTone,
  validateUpdate,
  type DailyUpdate,
  type DailyUpdateItem,
  type DailyUpdateSection,
} from "../_lib/daily-updates";
import { workRequest } from "../_lib/work-client";

type Line = DailyUpdateItem & { key: string };
type Lines = Record<DailyUpdateSection, Line[]>;

/**
 * The employee's update for one day. The draft is created from the person's own
 * evidence when none exists; lines the records produced carry a "From your
 * records" pill. Saving replaces the whole list. After a submit, saving is a
 * correction: the version rises and review starts over.
 */
export function DailyUpdateEditor({ canWrite }: { canWrite: boolean }) {
  const [date, setDate] = useState(() => dateInputFor());
  const [update, setUpdate] = useState<DailyUpdate | null>(null);
  const [summary, setSummary] = useState("");
  const [lines, setLines] = useState<Lines | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const counter = useRef(0);

  const withKeys = useCallback((items: DailyUpdateItem[]): Lines => {
    const grouped = groupBySection(items);
    const keyed = {} as Lines;
    for (const section of DAILY_UPDATE_SECTIONS) {
      keyed[section] = grouped[section].map((item) => ({
        ...item,
        key: `line-${(counter.current += 1)}`,
      }));
    }
    return keyed;
  }, []);

  const apply = useCallback(
    (next: DailyUpdate) => {
      setUpdate(next);
      setSummary(next.summary ?? "");
      setLines(withKeys(next.items));
    },
    [withKeys],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);
    workRequest<DailyUpdate>("daily-updates", "/draft", {
      method: "POST",
      body: buildDraftPayload(date),
    })
      .then((next) => {
        if (!cancelled) apply(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setUpdate(null);
          setLines(null);
          setError(e instanceof Error ? e.message : "The request failed.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, apply]);

  const flat = (): DailyUpdateItem[] =>
    lines ? DAILY_UPDATE_SECTIONS.flatMap((section) => lines[section]) : [];

  const setLine = (section: DailyUpdateSection, key: string, text: string) =>
    setLines((current) =>
      current
        ? {
            ...current,
            [section]: current[section].map((line) =>
              line.key === key ? { ...line, text } : line,
            ),
          }
        : current,
    );

  const addLine = (section: DailyUpdateSection) =>
    setLines((current) =>
      current
        ? {
            ...current,
            [section]: [
              ...current[section],
              {
                key: `line-${(counter.current += 1)}`,
                section,
                text: "",
                origin: "MANUAL",
              },
            ],
          }
        : current,
    );

  const removeLine = (section: DailyUpdateSection, key: string) =>
    setLines((current) =>
      current
        ? {
            ...current,
            [section]: current[section].filter((line) => line.key !== key),
          }
        : current,
    );

  const save = async (): Promise<DailyUpdate | null> => {
    if (!update) return null;
    const problem = validateUpdate({ summary, items: flat() });
    if (problem) {
      setError(problem);
      return null;
    }
    const saved = await workRequest<DailyUpdate>(
      "daily-updates",
      `/${update.id}`,
      { method: "PUT", body: buildSavePayload({ summary, items: flat() }) },
    );
    apply(saved);
    return saved;
  };

  const onSave = async () => {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const saved = await save();
      if (saved) {
        setNotice(
          isCorrection(saved.status)
            ? "Correction saved. Review starts again."
            : "Draft saved.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = async () => {
    if (!update) return;
    setBusy("submit");
    setError(null);
    setNotice(null);
    try {
      const saved = await save();
      if (!saved) return;
      const submitted = await workRequest<DailyUpdate>(
        "daily-updates",
        `/${update.id}/submit`,
        { method: "POST" },
      );
      apply(submitted);
      setNotice("Update submitted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(null);
    }
  };

  const correction = update ? isCorrection(update.status) : false;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DateField
          label="Update date"
          max={dateInputFor()}
          onChange={(value) => value && setDate(value)}
          value={date}
        />
        {update ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={statusTone(update.status)}>
              {STATUS_LABELS[update.status]}
            </StatusPill>
            {update.late ? <StatusPill tone="warning">Late</StatusPill> : null}
            <StatusPill tone="muted">{`Version ${update.version}`}</StatusPill>
            <span className="text-sm text-muted">{formatDate(update.forDate)}</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm text-foreground" role="status">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <div
          aria-busy="true"
          aria-label="Loading the update"
          className="h-64 animate-pulse rounded-[24px] bg-surface-strong"
          role="status"
        />
      ) : update && lines ? (
        <>
          <SectionCard title="Summary">
            <TextAreaField
              disabled={!canWrite}
              label="Summary of the day"
              onChange={setSummary}
              rows={3}
              value={summary}
            />
          </SectionCard>

          {DAILY_UPDATE_SECTIONS.map((section) => (
            <SectionCard key={section} title={SECTION_LABELS[section]}>
              <div
                aria-label={`${SECTION_LABELS[section]} lines`}
                className="grid gap-3"
                role="group"
              >
                {lines[section].length === 0 ? (
                  <p className="text-sm text-muted">No lines yet.</p>
                ) : null}
                {lines[section].map((line, index) => (
                  <div
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                    key={line.key}
                  >
                    <div className="grid gap-1">
                      <TextField
                        disabled={!canWrite}
                        label={`${SECTION_LABELS[section]} line ${index + 1}`}
                        maxLength={500}
                        onChange={(text) => setLine(section, line.key, text)}
                        value={line.text}
                      />
                      {isEvidenceBacked(line) ? (
                        <div>
                          <StatusPill tone="info">From your records</StatusPill>
                        </div>
                      ) : null}
                    </div>
                    {canWrite ? (
                      <Button
                        aria-label={`Remove ${SECTION_LABELS[section]} line ${index + 1}`}
                        onClick={() => removeLine(section, line.key)}
                        size="sm"
                        variant="danger-soft"
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))}
                {canWrite ? (
                  <div>
                    <Button
                      aria-label={`Add ${SECTION_LABELS[section]} line`}
                      leftIcon={<Plus className="h-4 w-4" />}
                      onClick={() => addLine(section)}
                      size="sm"
                      variant="secondary"
                    >
                      Add line
                    </Button>
                  </div>
                ) : null}
              </div>
            </SectionCard>
          ))}

          {canWrite ? (
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                disabled={busy !== null}
                loading={busy === "save"}
                onClick={() => void onSave()}
                variant="secondary"
              >
                {correction ? "Save correction" : "Save draft"}
              </Button>
              {correction ? null : (
                <Button
                  disabled={busy !== null}
                  loading={busy === "submit"}
                  onClick={() => void onSubmit()}
                >
                  Submit update
                </Button>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
