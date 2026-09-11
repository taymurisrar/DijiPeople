"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import { formatDate } from "@/lib/formatting-context";
import type {
  RecentReportView,
  ReportLibraryEntry,
} from "../_lib/reporting-types";
import { ReportGroup, ReportList } from "./report-list";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";

/*
 * The way in.
 *
 * ITEM-0128 — Reports used to lead with "Analytics surfaces": five cards, each
 * a paragraph plus a quoted "The Dashboard shows..." note, occupying the whole
 * first screen at 1440x900 before the report list a returning reader actually
 * came for even appeared. The distinction between an analytics surface and a
 * Dashboard widget is real and worth stating, but it is a distinction a reader
 * has not yet asked about on a return visit — a first-run tour or an empty
 * state is where an unasked-for explanation belongs, not the top of every
 * visit.
 *
 * Reports now leads, and the surfaces are a compact single-column list: one
 * line for the link and its description, with the Dashboard-contrast sentence
 * one disclosure away rather than printed for everyone every time. Nothing is
 * deleted — the acceptance criterion for this change is explicitly that no
 * caveat text is lost, only that its volume and placement stop hiding the
 * report list beneath it.
 */

export type ReportsLandingProps = {
  surfaces: readonly {
    key: string;
    label: string;
    description: string;
    versusDashboard: string;
  }[];
  standard: readonly ReportLibraryEntry[];
  custom: readonly ReportLibraryEntry[];
  favorites: readonly string[];
  recents: readonly RecentReportView[];
  canCreate: boolean;
  /** False when the library could not be read; the section then says so. */
  libraryAvailable: boolean;
};

export function ReportsLanding({
  surfaces,
  standard,
  custom,
  favorites,
  recents,
  canCreate,
  libraryAvailable,
}: ReportsLandingProps) {
  const formattingContext = useFormattingContext();
  const all = React.useMemo(() => [...standard, ...custom], [standard, custom]);

  const byTargetKey = React.useMemo(
    () => new Map(all.map((entry) => [entry.targetKey, entry])),
    [all],
  );

  const favoriteSet = React.useMemo(() => new Set(favorites), [favorites]);

  const favoriteEntries = favorites
    .map((targetKey) => byTargetKey.get(targetKey))
    .filter((entry): entry is ReportLibraryEntry => Boolean(entry));

  const recentRows = recents
    .map((recent) => ({ recent, entry: byTargetKey.get(recent.targetKey) }))
    .filter(
      (row): row is { recent: RecentReportView; entry: ReportLibraryEntry } =>
        Boolean(row.entry),
    );

  const hrefFor = (entry: ReportLibraryEntry) =>
    `/reports/library?target=${encodeURIComponent(entry.targetKey)}`;

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <SectionCard
        description="Standard reports are built in; custom ones are saved by people in this workspace. Both run against your own access, so two people can open the same report and see different rows."
        title="Reports"
      >
        {!libraryAvailable ? (
          <EmptyState
            description="The report library could not be loaded. The analytics surfaces below are unaffected, which usually means this is a temporary failure rather than a permission problem."
            title="The report library is unavailable right now"
          />
        ) : (
          <ReportList
            actions={
              canCreate ? (
                <Button
                  aria-label="Build a new custom report"
                  href="/reports/builder"
                  leftIcon={<Plus aria-hidden="true" className="h-4 w-4" />}
                  variant="primary"
                >
                  Create report
                </Button>
              ) : null
            }
            emptyAction={
              canCreate ? (
                <Button href="/reports/builder" variant="primary">
                  Create the first report
                </Button>
              ) : undefined
            }
            emptyDescription={
              canCreate
                ? "No standard reports cover the data your role can reach, and nobody has built a custom one yet."
                : "No standard reports cover the data your role can reach, and no custom report has been shared with you."
            }
            emptyTitle="No reports are available to you yet"
            entries={all}
            favorites={favoriteSet}
            hrefFor={hrefFor}
            leading={
              <>
                {favoriteEntries.length > 0 ? (
                  <ReportGroup
                    entries={favoriteEntries}
                    favorites={favoriteSet}
                    heading="Your favourites"
                    hrefFor={hrefFor}
                  />
                ) : null}

                {recentRows.length > 0 ? (
                  <ReportGroup
                    entries={recentRows.map((row) => row.entry)}
                    favorites={favoriteSet}
                    heading="Recently opened"
                    hrefFor={hrefFor}
                    metaFor={(entry) => {
                      const row = recentRows.find(
                        (candidate) =>
                          candidate.entry.targetKey === entry.targetKey,
                      );
                      if (!row) return undefined;
                      const when = formatDate(row.recent.viewedAt, formattingContext);
                      return row.recent.viewCount > 1
                        ? `Opened ${row.recent.viewCount} times, most recently ${when}`
                        : `Opened ${when}`;
                    }}
                  />
                ) : null}
              </>
            }
          />
        )}
      </SectionCard>

      <SectionCard
        description="Each surface is period-scoped and comparative: pick a window, compare it with another, filter it, break it down, and open the records behind any number."
        title="Analytics surfaces"
      >
        {surfaces.length === 0 ? (
          <EmptyState
            description="None of the reporting areas are available to your role, or the modules behind them are not enabled for this workspace. Standard reports above may still be available to you."
            title="No analytics surfaces are available to you"
          />
        ) : (
          <ul className="grid gap-1">
            {surfaces.map((surface) => (
              <li
                className="border-b border-border py-2 last:border-b-0"
                key={surface.key}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Link
                    className="text-sm font-semibold text-accent underline-offset-2 hover:underline"
                    href={`/reports/analytics/${surface.key}`}
                  >
                    {surface.label}
                  </Link>
                  <span className="text-xs leading-5 text-muted">
                    {surface.description}
                  </span>
                </div>
                {/*
                 * The Dashboard-contrast sentence: true and useful, but not
                 * something a returning reader has asked about on this visit.
                 * One disclosure away rather than a quoted block on every
                 * card — nothing here is lost, see the file comment above.
                 */}
                <details className="group mt-1">
                  <summary className="cursor-pointer list-none text-xs font-medium text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent">
                    How this differs from the Dashboard
                  </summary>
                  <p className="mt-1 border-l-2 border-border pl-3 text-xs leading-5 text-muted">
                    {surface.versusDashboard}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
