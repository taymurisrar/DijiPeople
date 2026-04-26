"use client";

import { useState } from "react";
import { PermissionGate } from "../../_components/permission-gate";

type TemplateScope = "mine" | "team" | "tenant";

type TimesheetTemplateExportButtonProps = {
  businessUnits: Array<{ id: string; label: string }>;
  canReadAll: boolean;
  canReadTeam: boolean;
  month: number;
  year: number;
};

export function TimesheetTemplateExportButton({
  businessUnits,
  canReadAll,
  canReadTeam,
  month,
  year,
}: TimesheetTemplateExportButtonProps) {
  const [selectedMonth, setSelectedMonth] = useState(String(month));
  const [selectedYear, setSelectedYear] = useState(String(year));
  const [scope, setScope] = useState<TemplateScope>(
    canReadAll ? "tenant" : canReadTeam ? "team" : "mine",
  );
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportTemplate() {
    setIsExporting(true);
    setError(null);

    const params = new URLSearchParams({
      month: selectedMonth,
      year: selectedYear,
      scope,
    });
    if (businessUnitId) {
      params.set("businessUnitId", businessUnitId);
    }

    try {
      const response = await fetch(`/api/timesheets/template/export?${params}`, {
        method: "GET",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? "Unable to export template.");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition");
      const fileName =
        parseFileName(contentDisposition) ??
        `timesheet-template-${selectedYear}-${selectedMonth.padStart(2, "0")}.xlsx`;
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Unable to export template.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <PermissionGate permission="timesheets.template.export">
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white/80 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            onChange={(event) => setSelectedMonth(event.target.value)}
            value={selectedMonth}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {monthLabel(value)}
              </option>
            ))}
          </select>
          <input
            className="w-24 rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            max={2100}
            min={2000}
            onChange={(event) => setSelectedYear(event.target.value)}
            type="number"
            value={selectedYear}
          />
          <select
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            onChange={(event) => setScope(event.target.value as TemplateScope)}
            value={scope}
          >
            <option value="mine">My timesheet</option>
            {canReadTeam ? <option value="team">My team</option> : null}
            {canReadAll ? <option value="tenant">All employees</option> : null}
          </select>
          {businessUnits.length > 0 ? (
            <select
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) => setBusinessUnitId(event.target.value)}
              value={businessUnitId}
            >
              <option value="">All business units</option>
              {businessUnits.map((businessUnit) => (
                <option key={businessUnit.id} value={businessUnit.id}>
                  {businessUnit.label}
                </option>
              ))}
            </select>
          ) : null}
          <button
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
            disabled={isExporting}
            onClick={exportTemplate}
            type="button"
          >
            {isExporting ? "Exporting..." : "Export Template"}
          </button>
        </div>
        <p className="text-xs text-muted">
          Exports an Excel template using tenant and business-unit timesheet settings.
        </p>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </PermissionGate>
  );
}

function monthLabel(month: number) {
  return new Date(2026, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  });
}

function parseFileName(contentDisposition: string | null) {
  if (!contentDisposition) {
    return null;
  }

  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? null;
}
