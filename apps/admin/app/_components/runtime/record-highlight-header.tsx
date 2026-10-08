"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Info } from "lucide-react";
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

/** A small contextual value under the main band — Source, Received, Workspace. */
export type RecordHeaderSecondaryItem = {
  label: string;
  value: string;
  href?: string;
  /** Opens outside the console, e.g. a tenant's workspace URL. */
  external?: boolean;
};

/**
 * The one record header every Platform Admin record page draws.
 *
 * There used to be three: a tenant header, the highlight header below, and a
 * page header with a metadata strip and the status group bolted on the right.
 * They answered the same question — what is this record, who owns it, what
 * state is it in, and why — in three different shapes, and the third squeezed
 * Owner, Status and Status reason into a fixed 26rem column beside a title that
 * then wrapped under them.
 *
 * The arrangement is Dynamics 365's: identity on the left, then the values an
 * operator reads first as equal-width cells that use the rest of the row and
 * wrap as whole cells when the row runs out — never shrinking a value into an
 * unreadable sliver to keep it on one line. Smaller context (source, dates,
 * related links) goes on a quiet secondary line so it cannot distort the band.
 */
export function RecordHeader({
  eyebrow,
  title,
  badge,
  cells,
  secondary,
  ariaLabel,
}: {
  eyebrow: string;
  title: string;
  /** Rendered beside the title — e.g. the tenant's environment. */
  badge?: ReactNode;
  /**
   * The primary values, in priority order: Owner, Status, Status reason, then
   * anything else. Each child is one grid cell; `RecordStatusGroup` with
   * `layout="cells"` contributes its slots as cells of its own.
   */
  cells?: ReactNode;
  secondary?: RecordHeaderSecondaryItem[];
  ariaLabel?: string;
}) {
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      aria-label={ariaLabel ?? `${eyebrow} summary`}
    >
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <div className="min-w-0 max-w-full flex-[1_1_16rem] lg:max-w-[30rem]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {eyebrow}
          </p>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="min-w-0 break-words text-xl font-semibold leading-7 text-slate-950">
              {title}
            </h1>
            {badge}
          </div>
        </div>
        {cells ? (
          <dl className="grid min-w-0 flex-[3_1_30rem] grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-6 gap-y-3">
            {cells}
          </dl>
        ) : null}
      </div>
      {secondary?.length ? (
        <dl className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-2 text-xs">
          {secondary.map((item) => (
            <div key={item.label} className="flex min-w-0 items-baseline gap-1.5">
              <dt className="text-slate-500">{item.label}</dt>
              <dd className="min-w-0 truncate font-medium text-slate-800">
                {item.href ? (
                  item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--admin-primary)] hover:underline"
                    >
                      {item.value}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : (
                    <Link
                      href={item.href}
                      className="text-[var(--admin-primary)] hover:underline"
                    >
                      {item.value}
                    </Link>
                  )
                ) : (
                  item.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/**
 * The record header for a module that declares a `highlight` (EXECPLAN-0055
 * D8): its key values as cells, with Owner as the only control — taken from
 * the status group so its permission check and assignment route are not
 * duplicated. Informational values are plain text and pills, so what can be
 * changed stays distinguishable from what cannot.
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
  /** The Owner cell, rendered by `RecordStatusGroup` with `slots={["owner"]}`. */
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
    : 0;
  const cells: ReactNode[] = items.map((item) => (
    <HighlightValue key={item.key} item={item} />
  ));
  if (highlight.owner && ownerControl)
    cells.splice(
      Math.max(ownerIndex, 0),
      0,
      <Fragment key="__owner">{ownerControl}</Fragment>,
    );

  return (
    <RecordHeader
      eyebrow={highlight.eyebrow ?? definition.displayName}
      title={title}
      cells={cells}
      ariaLabel={`${definition.displayName} summary`}
    />
  );
}

function HighlightValue({ item }: { item: ResolvedHighlight }) {
  return (
    <div className="min-w-0" title={item.hint}>
      <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {item.label}
        {item.hint ? (
          <Info className="h-3 w-3 text-slate-400" aria-hidden />
        ) : null}
      </dt>
      <dd className="mt-1 min-h-6 text-sm">
        {item.display === null ? (
          <span className="text-slate-400">Not set</span>
        ) : item.format === "status" ? (
          <span
            className={`inline-flex w-fit max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${HEADER_TONE_CLASSES[item.tone ?? "neutral"]}`}
          >
            {item.display}
          </span>
        ) : item.format === "code" ? (
          <span className="font-mono text-[13px] font-semibold text-slate-900">
            {item.display}
          </span>
        ) : (
          <span className="block truncate font-semibold text-slate-800">
            {item.display}
          </span>
        )}
        {item.hint ? <span className="sr-only"> — {item.hint}</span> : null}
      </dd>
    </div>
  );
}

export const HEADER_TONE_CLASSES: Record<
  NonNullable<RuntimeStatusDefinition["tone"]>,
  string
> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-rose-50 text-rose-800 ring-rose-200",
};
