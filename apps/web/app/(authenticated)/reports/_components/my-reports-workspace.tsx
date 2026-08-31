"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import type { ReportLibraryEntry } from "../_lib/reporting-types";
import {
  deleteReportDefinition,
  duplicateReportDefinition,
  reportingErrorMessage,
} from "../_lib/reporting-browser";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";

/*
 * Custom reports: the ones people in this workspace built.
 *
 * Split into "yours" and "shared with you", because the two carry different
 * expectations — you may delete the first and generally may not delete the
 * second, and a single list with some rows quietly missing a delete button
 * reads as a rendering bug rather than as a permission.
 *
 * `canEdit` and `canDelete` come from the API and are used exactly as sent. The
 * gates here are cosmetic — the API decides again when the request arrives —
 * but showing a delete control that will be refused is still a small lie, and
 * the server has already done the work of saying which is which.
 *
 * Deleting asks first. Not because a confirm dialog is a habit, but because a
 * report definition is the only artefact in this workspace whose loss is not
 * recoverable from the URL: a period, a filter and a breakdown can be typed
 * again in ten seconds; a twenty-column definition somebody tuned cannot.
 */

export type MyReportsWorkspaceProps = {
  entries: readonly ReportLibraryEntry[];
  currentUserId: string;
  canCreate: boolean;
};

export function MyReportsWorkspace({
  entries,
  currentUserId,
  canCreate,
}: MyReportsWorkspaceProps) {
  const router = useRouter();
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    React.useState<ReportLibraryEntry | null>(null);

  const mine = entries.filter((entry) => entry.ownerUserId === currentUserId);
  const shared = entries.filter((entry) => entry.ownerUserId !== currentUserId);

  const withDefinitionId = (targetKey: string) =>
    targetKey.startsWith("def:") ? targetKey.slice("def:".length) : null;

  const duplicate = React.useCallback(
    async (entry: ReportLibraryEntry) => {
      const id = withDefinitionId(entry.targetKey);
      if (!id) return;

      setBusyKey(entry.targetKey);
      setError(null);
      try {
        await duplicateReportDefinition(id);
        router.refresh();
      } catch (caught) {
        setError(reportingErrorMessage(caught));
      } finally {
        setBusyKey(null);
      }
    },
    [router],
  );

  const confirmDelete = React.useCallback(async () => {
    if (!pendingDelete) return;
    const id = withDefinitionId(pendingDelete.targetKey);
    if (!id) return;

    setBusyKey(pendingDelete.targetKey);
    setError(null);
    try {
      await deleteReportDefinition(id);
      setPendingDelete(null);
      router.refresh();
    } catch (caught) {
      setError(reportingErrorMessage(caught));
    } finally {
      setBusyKey(null);
    }
  }, [pendingDelete, router]);

  if (entries.length === 0) {
    return (
      <EmptyState
        action={
          canCreate ? (
            <Button
              href="/reports/builder"
              leftIcon={<Plus aria-hidden="true" className="h-4 w-4" />}
              variant="primary"
            >
              Build your first report
            </Button>
          ) : undefined
        }
        description={
          canCreate
            ? "You have not built a custom report yet, and nobody has shared one with you. Start from a data source, pick the columns you want, and save it."
            : "Nobody has shared a custom report with you, and your role does not include building them. The standard reports in the library are still available."
        }
        title="No custom reports yet"
      />
    );
  }

  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      {error ? (
        <p
          className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {canCreate ? (
        <div className="flex justify-end">
          <Button
            href="/reports/builder"
            leftIcon={<Plus aria-hidden="true" className="h-4 w-4" />}
            variant="primary"
          >
            Create report
          </Button>
        </div>
      ) : null}

      <ReportGroup
        busyKey={busyKey}
        emptyMessage="You have not built a custom report yet."
        entries={mine}
        heading="Built by you"
        onDelete={setPendingDelete}
        onDuplicate={duplicate}
      />

      <ReportGroup
        busyKey={busyKey}
        emptyMessage="Nobody has shared a custom report with you."
        entries={shared}
        heading="Shared with you"
        onDelete={setPendingDelete}
        onDuplicate={duplicate}
      />

      <Dialog
        busy={busyKey !== null}
        description={
          pendingDelete
            ? `"${pendingDelete.name}" will be removed for everyone it is shared with. Its definition cannot be recovered, though the data it reads is untouched.`
            : ""
        }
        footer={
          <>
            <Button
              disabled={busyKey !== null}
              onClick={() => setPendingDelete(null)}
              variant="secondary"
            >
              Keep it
            </Button>
            <Button
              loading={busyKey !== null}
              onClick={() => void confirmDelete()}
              variant="danger"
            >
              Delete report
            </Button>
          </>
        }
        onClose={() => setPendingDelete(null)}
        open={pendingDelete !== null}
        size="sm"
        title="Delete this report?"
      />
    </div>
  );
}

function ReportGroup({
  busyKey,
  emptyMessage,
  entries,
  heading,
  onDelete,
  onDuplicate,
}: {
  busyKey: string | null;
  emptyMessage: string;
  entries: readonly ReportLibraryEntry[];
  heading: string;
  onDelete: (entry: ReportLibraryEntry) => void;
  onDuplicate: (entry: ReportLibraryEntry) => void;
}) {
  const formattingContext = useFormattingContext();
  const headingId = `my-reports-${heading.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <section aria-labelledby={headingId}>
      <h2
        className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted"
        id={headingId}
      >
        {heading}
      </h2>

      {entries.length === 0 ? (
        <p className="text-sm text-muted">{emptyMessage}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.targetKey}>
              <article className="flex h-full flex-col gap-3 rounded-[22px] border border-border bg-surface p-5 shadow-sm">
                <h3 className="text-sm font-semibold leading-5 text-foreground">
                  <Link
                    className="text-accent underline-offset-2 hover:underline"
                    href={`/reports/library?target=${encodeURIComponent(entry.targetKey)}`}
                  >
                    {entry.name}
                  </Link>
                </h3>

                {entry.description ? (
                  <p className="text-xs leading-5 text-muted">
                    {entry.description}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone="info">{entry.category}</StatusPill>
                  {entry.updatedAt ? (
                    <span className="text-xs text-muted">
                      Updated {formatDate(entry.updatedAt, formattingContext)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  {entry.canEdit ? (
                    <Button
                      aria-label={`Duplicate the report ${entry.name}`}
                      disabled={busyKey !== null}
                      leftIcon={<Copy aria-hidden="true" className="h-4 w-4" />}
                      onClick={() => onDuplicate(entry)}
                      size="xs"
                      variant="ghost"
                    >
                      Duplicate
                    </Button>
                  ) : null}

                  {entry.canDelete ? (
                    <Button
                      aria-label={`Delete the report ${entry.name}`}
                      disabled={busyKey !== null}
                      leftIcon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                      onClick={() => onDelete(entry)}
                      size="xs"
                      variant="ghost"
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
