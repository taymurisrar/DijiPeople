"use client";

import * as React from "react";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { TextField } from "@/app/components/ui/form-control";
import type { ReportLibraryEntry } from "../_lib/reporting-types";
import { groupByCategory, matchesReportSearch } from "../_lib/report-search";
import { ReportCard } from "./report-card";

/*
 * A searchable, grouped list of reports.
 *
 * One component for the overview, the library and My reports, because the three
 * differ only in which entries they are handed and what "empty" means on them —
 * and *that* is the part worth not sharing. Each caller passes its own empty
 * title and description, since "no reports exist yet", "nothing matches this
 * search" and "you have not built one" are three different situations and a
 * single message for all three is the BUG-1654 / 1752 / 1559 defect exactly.
 *
 * The search itself is `matchesReportSearch`, which is pure and tested; this
 * file only arranges controls.
 */

export type ReportListProps = {
  entries: readonly ReportLibraryEntry[];
  favorites: ReadonlySet<string>;
  /** Where a report's name links to. */
  hrefFor: (entry: ReportLibraryEntry) => string;
  /** Rendered above the groups, e.g. favourites and recents. */
  leading?: React.ReactNode;
  searchLabel?: string;
  actions?: React.ReactNode;
  /** Shown when the caller has nothing at all to list. */
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
  /** Groups are suppressed while a search is running; leading is too. */
  onSearchChange?: (value: string) => void;
};

export function ReportList({
  entries,
  favorites,
  hrefFor,
  leading,
  searchLabel = "Find a report",
  actions,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onSearchChange,
}: ReportListProps) {
  const [search, setSearch] = React.useState("");

  const handleSearch = React.useCallback(
    (value: string) => {
      setSearch(value);
      onSearchChange?.(value);
    },
    [onSearchChange],
  );

  const matching = React.useMemo(
    () => entries.filter((entry) => matchesReportSearch(entry, search)),
    [entries, search],
  );

  const grouped = React.useMemo(() => groupByCategory(matching), [matching]);
  const isSearching = search.trim().length > 0;

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <TextField
          className="sm:max-w-sm"
          label={searchLabel}
          onChange={handleSearch}
          placeholder="Search by name, description or category"
          type="search"
          value={search}
        />
        {actions}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          action={emptyAction}
          description={emptyDescription}
          title={emptyTitle}
        />
      ) : matching.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={() => handleSearch("")} variant="secondary">
              Clear the search
            </Button>
          }
          description={`Nothing here matches "${search.trim()}". Try a shorter term, or clear the search to see all ${entries.length}.`}
          title="No reports match your search"
        />
      ) : (
        <div className="grid gap-6">
          {!isSearching ? leading : null}

          {grouped.map((group) => (
            <ReportGroup
              entries={group.entries}
              favorites={favorites}
              heading={group.category}
              hrefFor={hrefFor}
              key={group.category}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ReportGroup({
  entries,
  favorites,
  heading,
  hrefFor,
  metaFor,
}: {
  entries: readonly ReportLibraryEntry[];
  favorites: ReadonlySet<string>;
  heading: string;
  hrefFor: (entry: ReportLibraryEntry) => string;
  metaFor?: (entry: ReportLibraryEntry) => string | undefined;
}) {
  const headingId = `report-group-${heading.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <section aria-labelledby={headingId}>
      <h3
        className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted"
        id={headingId}
      >
        {heading}
      </h3>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <li key={entry.targetKey}>
            <ReportCard
              entry={entry}
              href={hrefFor(entry)}
              isFavorite={favorites.has(entry.targetKey)}
              meta={metaFor?.(entry)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
