"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTablePagination } from "@/app/components/data-table/data-table-pagination";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import type {
  ReportResultColumn,
  ReportResultRow,
} from "../_lib/reporting-types";
import { formatRecordCell, MISSING_VALUE_TEXT } from "../_lib/report-format";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";

/*
 * The rows behind the numbers.
 *
 * The second thing a Dashboard widget does not do: every aggregate on these
 * screens is answerable with "which records is that?", and the answer is this
 * table, paged and sorted on the server against the same scope, period and
 * filters that produced the chart above it.
 *
 * Three rules the shared components already encode and this file relies on:
 *
 * - **The total is the API's total.** `mode="server"` makes `DataTable` read
 *   `pagination.total` rather than counting the rows it was handed. Reporting a
 *   page length as a total is BUG-2043, and it is very easy to reintroduce on a
 *   screen where the rows on screen genuinely are all the rows fetched.
 * - **Sorting and paging are URL state.** `DataTable` in server mode writes
 *   `orderBy=<field> <direction>` and resets `page`, and `DataTablePagination`
 *   writes `page`/`pageSize` as links. Both survive a bookmark and a back
 *   button, and the server reads them.
 * - **A link is named by where it goes.** BUG-2149 is a page of controls whose
 *   accessible name is "Open". The record link here is the first cell's own
 *   text, and where that cell is empty it names the record explicitly rather
 *   than falling back to a generic word.
 */

export type ReportRecordsTableProps = {
  title: string;
  description?: string;
  columns: readonly ReportResultColumn[];
  rows: readonly ReportResultRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Field keys the API will actually sort on. Others render unsortable. */
  sortableKeys?: readonly string[];
  currencyCode?: string | null;
  emptyTitle: string;
  emptyDescription: string;
  /** What the record link says it opens, e.g. "employee record". */
  recordNoun?: string;
  footer?: React.ReactNode;
};

export function ReportRecordsTable({
  title,
  description,
  columns,
  rows,
  total,
  page,
  pageSize,
  sortableKeys,
  currencyCode,
  emptyTitle,
  emptyDescription,
  recordNoun = "record",
  footer,
}: ReportRecordsTableProps) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  /*
   * Formatting has to be read from the provider, not left to the module-level
   * default. That default is installed by an effect, and effects do not run
   * during server rendering: the server produced "Mar 10, 2025" while the
   * client produced the tenant's "03/10/2025", React reported a hydration
   * mismatch (#418) and threw the whole table away to re-render it. Found on
   * production after deploy, not by the local suite — see BUG-2647.
   */
  const formattingContext = useFormattingContext();

  const paginationParams = React.useMemo(() => {
    const entries: Record<string, string | undefined> = {};
    searchParams?.forEach((value, key) => {
      entries[key] = value;
    });
    return entries;
  }, [searchParams]);

  const sortable = React.useMemo(
    () => new Set(sortableKeys ?? []),
    [sortableKeys],
  );

  const tableColumns = React.useMemo<DataTableColumn<ReportResultRow>[]>(
    () =>
      columns.map((column, index) => ({
        key: column.key,
        /* `entityField` is what server-mode sorting puts in `orderBy`. */
        entityField: column.key,
        header: column.label,
        sortable: sortable.has(column.key),
        render: (row) => {
          const text = formatRecordCell(row.values[column.key], column, {
            currencyCode,
            context: formattingContext,
          });

          if (index !== 0 || !row.href) {
            return <span>{text}</span>;
          }

          const name =
            text === MISSING_VALUE_TEXT
              ? `Open the ${recordNoun} ${row.id}`
              : `Open the ${recordNoun} for ${text}`;

          return (
            <Link
              aria-label={name}
              className="font-medium text-accent underline-offset-2 hover:underline"
              href={row.href}
            >
              {text}
            </Link>
          );
        },
      })),
    [columns, currencyCode, formattingContext, recordNoun, sortable],
  );

  if (rows.length === 0) {
    return (
      <SectionCard description={description} title={title}>
        <EmptyState description={emptyDescription} title={emptyTitle} />
        {footer ? <div className="mt-4">{footer}</div> : null}
      </SectionCard>
    );
  }

  return (
    <SectionCard description={description} title={title}>
      <DataTable<ReportResultRow>
        columns={tableColumns}
        /*
         * Off deliberately. In server mode the shared search filters the
         * *loaded page only*, which on a 4,000-row result is a control that
         * appears to search everything and does not. The period, the scope
         * filters and the drill-down are the real narrowing here.
         */
        enableSearch={false}
        footer={
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            pathname={pathname}
            searchParams={paginationParams}
            totalItems={total}
          />
        }
        getRowKey={(row) => row.id}
        mode="server"
        pagination={{ page, pageSize, total }}
        rows={[...rows]}
      />
      {footer ? <div className="mt-4">{footer}</div> : null}
    </SectionCard>
  );
}
