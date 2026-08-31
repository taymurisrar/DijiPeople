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

/*
 * The way in.
 *
 * Ordered by what a returning reader wants first: the analytics surfaces they
 * live in, then the reports they pinned, then the ones they opened recently,
 * then the whole catalogue by category. A first-time reader gets the same order
 * with the middle two sections absent, which is why each has its own empty
 * condition rather than a shared one.
 *
 * Each surface card prints the sentence that distinguishes it from the
 * Dashboard widget of the same name. That is not marketing copy — the two
 * screens genuinely answer different questions, and a reader who does not know
 * which one to open will open the wrong one.
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
    <div className="grid gap-5">
      <SectionCard
        description="Each surface is period-scoped and comparative: pick a window, compare it with another, filter it, break it down, and open the records behind any number."
        title="Analytics surfaces"
      >
        {surfaces.length === 0 ? (
          <EmptyState
            description="None of the reporting areas are available to your role, or the modules behind them are not enabled for this workspace. Standard reports below may still be available to you."
            title="No analytics surfaces are available to you"
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {surfaces.map((surface) => (
              <li key={surface.key}>
                <article className="flex h-full flex-col gap-2 rounded-[22px] border border-border bg-surface-strong p-5">
                  <h3 className="text-sm font-semibold text-foreground">
                    <Link
                      className="text-accent underline-offset-2 hover:underline"
                      href={`/reports/analytics/${surface.key}`}
                    >
                      {surface.label}
                    </Link>
                  </h3>
                  <p className="text-xs leading-5 text-muted">
                    {surface.description}
                  </p>
                  <p className="mt-auto border-l-2 border-border pl-3 text-xs leading-5 text-muted">
                    {surface.versusDashboard}
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        description="Standard reports are built in; custom ones are saved by people in this workspace. Both run against your own access, so two people can open the same report and see different rows."
        title="Reports"
      >
        {!libraryAvailable ? (
          <EmptyState
            description="The report library could not be loaded. The analytics surfaces above are unaffected, which usually means this is a temporary failure rather than a permission problem."
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
                      const when = formatDate(row.recent.viewedAt);
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
    </div>
  );
}
