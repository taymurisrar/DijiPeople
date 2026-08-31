"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { SelectField } from "@/app/components/ui/form-control";
import { formatDateTime, formatNumber } from "@/lib/formatting-context";
import { PermissionGate } from "../../_components/permission-gate";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import {
  createReportExport,
  reportExportDownloadHref,
  reportingErrorMessage,
  type ReportExportRun,
} from "../_lib/reporting-browser";
import type { ReportFilterInput } from "../_lib/reporting-types";

/*
 * Export, offered only where it can actually run.
 *
 * `available` is `getReportingCapabilities().export`: the endpoint exists AND
 * this app's request body has been checked against `CreateReportExportDto`.
 * While either is false this renders **nothing at all** — not a disabled
 * button, not a tooltip, not a "coming soon" pill. A disabled control is a
 * promise, and a promise the product cannot keep reads as a broken feature in
 * the reader's own tenant.
 *
 * The body is exactly the DTO: `targetKey`, `format`, and optionally `preset`,
 * `from`, `to` and `filters`. Nothing else — the API validates with
 * `forbidNonWhitelisted: true`, so one surplus key is a 400 rather than an
 * ignored field, and it is very tempting to spread the analytics query body in
 * here because it is right there.
 *
 * **A target key is required, so analytics surfaces have no export.** The
 * orchestrator runs `ReportExecutionService.runAll`, which rejects a `srf:`
 * target outright ("An analytics surface cannot be run as a tabular report").
 * This component is therefore used on the report runner and not on a surface;
 * see this work package's report.
 *
 * The export runs synchronously inside the request and returns a `ReportRun`,
 * so the dialog turns into a download link rather than a "we will email you"
 * message. The link is a plain anchor to the proxy's download route: the file
 * is streamed, and the proxy forwards it as bytes rather than parsing it as
 * JSON.
 */

export type ExportMenuProps = {
  available: boolean;
  /** `std:<key>` or `def:<uuid>`. A surface cannot be exported. */
  targetKey: string;
  /** The period and filters on screen, in the DTO's own shape. */
  period?: { preset?: string; from?: string; to?: string };
  filters?: readonly ReportFilterInput[];
  /** Names the export for assistive technology: "Attendance, August 2026". */
  subject: string;
};

const FORMAT_OPTIONS = [
  { value: "XLSX", label: "Excel (XLSX)" },
  { value: "CSV", label: "CSV" },
  { value: "PDF", label: "PDF" },
] as const;

export function ExportMenu({
  available,
  targetKey,
  period,
  filters,
  subject,
}: ExportMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [format, setFormat] = React.useState<string>("XLSX");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [run, setRun] = React.useState<ReportExportRun | null>(null);

  if (!available) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      setRun(
        await createReportExport({
          targetKey,
          format,
          ...(period?.preset ? { preset: period.preset } : {}),
          ...(period?.from ? { from: period.from } : {}),
          ...(period?.to ? { to: period.to } : {}),
          ...(filters?.length ? { filters: [...filters] } : {}),
        }),
      );
    } catch (caught) {
      setError(reportingErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PermissionGate permission={PERMISSION_KEYS.REPORTS_EXPORT}>
      <Button
        aria-label={`Export ${subject}`}
        leftIcon={<Download aria-hidden="true" className="h-4 w-4" />}
        onClick={() => {
          setRun(null);
          setError(null);
          setOpen(true);
        }}
        size="xs"
        variant="secondary"
      >
        Export
      </Button>

      <Dialog
        busy={busy}
        description={`The export uses the period and filters currently on screen, and runs under your own access: ${subject}.`}
        footer={
          run ? (
            <>
              <Button onClick={() => setOpen(false)} variant="secondary">
                Close
              </Button>
              {/*
               * A real anchor, not a scripted save. The file is streamed by the
               * API through the proxy, and `download` lets the browser name it
               * from the Content-Disposition the API already sets.
               */}
              <Button
                aria-label={`Download ${run.fileName ?? subject}`}
                href={reportExportDownloadHref(run.runId)}
                variant="primary"
              >
                Download
              </Button>
            </>
          ) : (
            <>
              <Button
                disabled={busy}
                onClick={() => setOpen(false)}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button loading={busy} onClick={() => void submit()} variant="primary">
                Build the file
              </Button>
            </>
          )
        }
        onClose={() => setOpen(false)}
        open={open}
        size="sm"
        title="Export this report"
      >
        {run ? (
          <div className="grid gap-2 text-sm leading-6 text-foreground" role="status">
            <p>
              {run.fileName ? <strong>{run.fileName}</strong> : "The file"} is
              ready
              {typeof run.rowCount === "number"
                ? `, with ${formatNumber(run.rowCount)} rows`
                : ""}
              .
            </p>
            {run.expiresAt ? (
              <p className="text-xs text-muted">
                It is kept until {formatDateTime(run.expiresAt)}, after which it
                is deleted and has to be built again.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4">
            <SelectField
              hint="PDF is laid out for reading and may not carry every row; CSV and XLSX carry all of them."
              label="Format"
              onChange={setFormat}
              options={FORMAT_OPTIONS.map((option) => ({ ...option }))}
              value={format}
            />
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </Dialog>
    </PermissionGate>
  );
}
