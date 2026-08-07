"use client";

import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import type { DataModuleSummary } from "../page";

/**
 * Template download for each module that supports data management.
 *
 * Only capabilities that exist end to end are surfaced. Import and export
 * actions appear as modules gain them, rather than as disabled buttons that
 * imply a feature which is not wired up.
 */
export function TemplateDownloadPanel({
  modules,
}: {
  readonly modules: readonly DataModuleSummary[];
}) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function downloadTemplate(module: DataModuleSummary) {
    setDownloading(module.moduleKey);
    setError(null);

    try {
      const response = await fetch(
        `/api/data-management/modules/${encodeURIComponent(module.moduleKey)}/template`,
        { headers: { "x-dijipeople-error-handling": "inline" } },
      );

      if (!response.ok) {
        setError(
          response.status === 403
            ? "You do not have permission to download templates."
            : `Template download failed (${response.status}).`,
        );
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `${module.moduleKey}-import-template.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Template download failed. Check your connection and retry.");
    } finally {
      setDownloading(null);
    }
  }

  if (modules.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-muted">
        No modules are configured for data management yet.
      </div>
    );
  }

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="text-base font-semibold text-foreground">
          Download templates
        </h3>
        <p className="text-sm text-muted">
          Each template contains a Data sheet, an Instructions sheet describing
          every column, and reference sheets listing the values this tenant
          accepts for lookup columns.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <article
            className="grid gap-3 rounded-2xl border border-border bg-surface p-4"
            key={module.moduleKey}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-semibold text-foreground">
                  {module.label}
                </h4>
                <p className="mt-1 text-xs text-muted">
                  {module.fieldCount} columns · {module.requiredFieldCount}{" "}
                  required
                </p>
              </div>
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted" />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Capability enabled={module.supportsImport} label="Import" />
              <Capability enabled={module.supportsExport} label="Export" />
            </div>

            <Button
              disabled={downloading === module.moduleKey}
              loading={downloading === module.moduleKey}
              loadingText="Preparing..."
              onClick={() => void downloadTemplate(module)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Download className="h-4 w-4" />
              Download template
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Capability({
  enabled,
  label,
}: {
  readonly enabled: boolean;
  readonly label: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        enabled
          ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-slate-50 text-muted",
      ].join(" ")}
    >
      {label} {enabled ? "supported" : "not yet"}
    </span>
  );
}
