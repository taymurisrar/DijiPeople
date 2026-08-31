"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  addFavorite,
  removeFavorite,
  reportingErrorMessage,
} from "../_lib/reporting-browser";
import type { ReportLibraryEntry } from "../_lib/reporting-types";

/*
 * One report in a list, with the control that pins it.
 *
 * Two accessibility details that are easy to get wrong on a card like this and
 * both of which this repository has a bug record for:
 *
 * - **The link is named by the report** (BUG-2149). The whole card is not the
 *   link; the report's own name is, so a screen reader's list of links reads
 *   "Headcount by department", not eleven entries called "Open".
 * - **The star is not the only signal** (BUG-2148). Favourited state is carried
 *   by `aria-pressed` and by the button's accessible name, which says whether
 *   pressing it will add or remove — not by the fill colour of an icon.
 */

export type ReportCardProps = {
  entry: ReportLibraryEntry;
  href: string;
  isFavorite: boolean;
  /** Absent for a user whose role cannot pin reports. */
  canFavorite?: boolean;
  /** e.g. "Opened 4 times, most recently 12 Aug 2026". */
  meta?: string;
};

export function ReportCard({
  entry,
  href,
  isFavorite,
  canFavorite = true,
  meta,
}: ReportCardProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (isFavorite) {
        await removeFavorite(entry.targetKey);
      } else {
        await addFavorite(entry.targetKey);
      }
      router.refresh();
    } catch (caught) {
      setError(reportingErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [entry.targetKey, isFavorite, router]);

  return (
    <article className="flex h-full flex-col gap-3 rounded-[22px] border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-5 text-foreground">
          <Link
            className="text-accent underline-offset-2 hover:underline"
            href={href}
          >
            {entry.name}
          </Link>
        </h3>

        {canFavorite ? (
          <Button
            aria-label={
              isFavorite
                ? `Remove ${entry.name} from your favourites`
                : `Add ${entry.name} to your favourites`
            }
            aria-pressed={isFavorite}
            className="shrink-0"
            disabled={busy}
            onClick={() => void toggle()}
            size="icon-xs"
            variant="ghost"
          >
            <Star
              aria-hidden="true"
              className={`h-4 w-4 ${isFavorite ? "fill-current text-accent" : ""}`}
            />
          </Button>
        ) : null}
      </div>

      {entry.description ? (
        <p className="text-xs leading-5 text-muted">{entry.description}</p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <StatusPill tone={entry.isStandard ? "muted" : "info"}>
          {entry.isStandard ? "Standard report" : "Custom report"}
        </StatusPill>
        {entry.category ? (
          <span className="text-xs text-muted">{entry.category}</span>
        ) : null}
      </div>

      {meta ? <p className="text-xs text-muted">{meta}</p> : null}

      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
