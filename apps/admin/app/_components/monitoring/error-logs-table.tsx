"use client";

import { ArrowDownUp, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminCommandButton } from "@/app/_components/admin-ui";

export type PlatformLogFile = {
  fileName: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
};

type SortKey = "fileName" | "modifiedAt" | "size";

export function ErrorLogsTable({ logs }: { logs: PlatformLogFile[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("modifiedAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      const left = valueForSort(a, sortKey);
      const right = valueForSort(b, sortKey);
      const result = left > right ? 1 : left < right ? -1 : 0;
      return direction === "asc" ? result : -result;
    });
  }, [direction, logs, sortKey]);

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setDirection(nextKey === "fileName" ? "asc" : "desc");
  }

  if (!logs.length) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">No log files</h2>
        <p className="mt-2 text-sm text-slate-600">
          No platform log files are available in the configured log directory.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <HeaderButton
                label="File"
                onClick={() => toggleSort("fileName")}
              />
              <HeaderButton
                label="Modified"
                onClick={() => toggleSort("modifiedAt")}
              />
              <HeaderButton label="Size" onClick={() => toggleSort("size")} />
              <th className="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedLogs.map((log) => (
              <tr key={log.fileName} className="hover:bg-slate-50/70">
                <td className="px-5 py-4 font-semibold text-slate-950">
                  {log.fileName}
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {formatDateTime(log.modifiedAt)}
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {formatBytes(log.size)}
                </td>
                <td className="px-5 py-4 text-right">
                  <AdminCommandButton
                    href={`/api/platform/logs/${encodeURIComponent(
                      log.fileName,
                    )}/download`}
                    icon={Download}
                  >
                    Download
                  </AdminCommandButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeaderButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <th className="px-5 py-4">
      <button
        className="inline-flex items-center gap-2 rounded-lg text-left transition hover:text-slate-950"
        onClick={onClick}
        type="button"
      >
        {label}
        <ArrowDownUp className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}

function valueForSort(log: PlatformLogFile, sortKey: SortKey) {
  if (sortKey === "fileName") return log.fileName.toLowerCase();
  if (sortKey === "size") return log.size;
  return new Date(log.modifiedAt).getTime();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
