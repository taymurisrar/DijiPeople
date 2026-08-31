"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import type { ReportLibraryEntry } from "../_lib/reporting-types";
import { ReportList } from "./report-list";

/*
 * Browsing every report, standard and custom together.
 *
 * They are one list on purpose. A reader looking for "the headcount one" does
 * not know or care whether it shipped with the product or was saved by a
 * colleague last week, and splitting the library along that line makes them
 * look in two places. The distinction is still visible — each card carries a
 * "Standard report" or "Custom report" pill — it just is not the primary axis.
 * Category is, because that is how people describe what they are looking for.
 */

export type ReportLibraryBrowserProps = {
  entries: readonly ReportLibraryEntry[];
  favorites: readonly string[];
  canCreate: boolean;
  libraryAvailable: boolean;
};

export function ReportLibraryBrowser({
  entries,
  favorites,
  canCreate,
  libraryAvailable,
}: ReportLibraryBrowserProps) {
  const favoriteSet = React.useMemo(() => new Set(favorites), [favorites]);

  if (!libraryAvailable) {
    return (
      <EmptyState
        description="The report library could not be loaded. This is a failure of the library endpoint rather than a permission problem - the analytics surfaces are unaffected."
        title="The report library is unavailable right now"
      />
    );
  }

  return (
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
      entries={entries}
      favorites={favoriteSet}
      hrefFor={(entry) =>
        `/reports/library?target=${encodeURIComponent(entry.targetKey)}`
      }
      searchLabel="Find a report in the library"
    />
  );
}
