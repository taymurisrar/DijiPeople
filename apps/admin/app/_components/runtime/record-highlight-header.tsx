"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import type {
  PlatformModuleDefinition,
  RuntimeRecordHighlightDefinition,
  RuntimeStatusDefinition,
} from "@/lib/runtime/platform-runtime.types";
import {
  resolveHighlightTitle,
  resolveRecordHighlights,
  type ResolvedHighlight,
} from "@/lib/runtime/record-highlight";

/**
 * The record highlight header (EXECPLAN-0055 D8).
 *
 * Dynamics 365 opens a record with its name and the four or five values an
 * operator reads before anything else, in one compact band. Platform Admin
 * drew a page header whose only metadata for most modules was "Created", with
 * the status group beside it — so a partner's number, account state and the
 * phase it was in were each a tab away.
 *
 * Driven entirely by the module's `highlight` declaration, so any runtime
 * module can opt in without code here. Informational values are plain text and
 * pills; the one control — Owner, taken from the record header status group so
 * its permission check and assignment route are not duplicated — keeps its
 * bordered field look, so what can be changed is distinguishable from what
 * cannot. A read-only value that has a reason carries it as a tooltip and an
 * info mark, never as a paragraph.
 */
export function RecordHighlightHeader({
  definition,
  highlight,
  record,
  ownerControl,
}: {
  definition: PlatformModuleDefinition;
  highlight: RuntimeRecordHighlightDefinition;
  record: Record<string, unknown>;
  /** The Owner slot, rendered by `RecordStatusGroup` with `slots={["owner"]}`. */
  ownerControl?: ReactNode;
}) {
  const title = resolveHighlightTitle(
    highlight,
    record,
    definition.displayName,
  );
  const items = resolveRecordHighlights(highlight, record);
  const ownerAfter = highlight.owner?.after;
  const ownerIndex = ownerAfter
    ? items.findIndex((item) => item.key === ownerAfter) + 1
    : items.length;
  const cells: ReactNode[] = items.map((item) => (
    <HighlightValue key={item.key} item={item} />
  ));
  if (highlight.owner && ownerControl)
    cells.splice(
      ownerIndex > 0 ? ownerIndex : items.length,
      0,
      <div key="__owner" className="min-w-0">
        {ownerControl}
      </div>,
    );

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      aria-label={`${definition.displayName} summary`}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 xl:max-w-[32%]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {highlight.eyebrow ?? definition.displayName}
          </p>
          <h1 className="mt-0.5 break-words text-xl font-semibold leading-7 text-slate-950">
            {title}
          </h1>
        </div>
        <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-3">
          {cells}
        </div>
      </div>
    </section>
  );
}

function HighlightValue({ item }: { item: ResolvedHighlight }) {
  return (
    <dl className="min-w-[7.5rem] max-w-[16rem]" title={item.hint}>
      <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {item.label}
        {item.hint ? (
          <Info className="h-3 w-3 text-slate-400" aria-hidden />
        ) : null}
      </dt>
      <dd className="mt-1 text-sm">
        {item.display === null ? (
          <span className="text-slate-400">Not set</span>
        ) : item.format === "status" ? (
          <span
            className={`inline-flex w-fit max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${TONE_CLASSES[item.tone ?? "neutral"]}`}
          >
            {item.display}
          </span>
        ) : item.format === "code" ? (
          <span className="font-mono text-[13px] font-semibold text-slate-900">
            {item.display}
          </span>
        ) : (
          <span className="font-semibold text-slate-800">{item.display}</span>
        )}
        {item.hint ? <span className="sr-only"> — {item.hint}</span> : null}
      </dd>
    </dl>
  );
}

const TONE_CLASSES: Record<
  NonNullable<RuntimeStatusDefinition["tone"]>,
  string
> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-rose-50 text-rose-800 ring-rose-200",
};
