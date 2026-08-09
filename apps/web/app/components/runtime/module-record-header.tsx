"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EntityMetadata } from "../../../lib/runtime/metadata-runtime.types";
import { debugRuntime } from "../../../lib/runtime/runtime-debug";
import {
  ModuleRecordStatusPopover,
  buildRecordStatusSummary,
} from "./module-record-status-popover";
import { ModuleRecordStatusSummary } from "./module-record-status-summary";
import type {
  RuntimeRecordData,
  RuntimeStatusGroupConfig,
} from "./module-runtime-ui.types";

export function ModuleRecordHeader({
  entity,
  formSelector,
  record,
  statusGroupConfig,
  subtitle,
  title,
}: {
  readonly entity: EntityMetadata;
  readonly formSelector?: ReactNode;
  readonly record?: RuntimeRecordData | null;
  readonly statusGroupConfig?: RuntimeStatusGroupConfig | null;
  readonly subtitle?: string;
  readonly title?: string;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const statusContainerRef = useRef<HTMLDivElement | null>(null);
  /*
   * A record page must name its record. The primary name field is often a
   * composed value ("fullName", "employeeName") that a given payload may not
   * carry, and falling straight through to the entity label produced a page
   * headed "Employee" with no indication of which employee.
   */
  const recordTitle =
    title ??
    formatValue(record?.[entity.primaryNameField]) ??
    composeRecordName(record) ??
    entity.displayName;
  const statusSummary = buildRecordStatusSummary(record, statusGroupConfig);
  const hasStatusGroup = Boolean(statusGroupConfig?.enabled);
  const statusGroupDisabled = Boolean(statusGroupConfig?.disabled);

  useEffect(() => {
    if (!statusOpen) return;

    function handlePointerDown(event: MouseEvent | PointerEvent) {
      if (
        statusContainerRef.current &&
        event.target instanceof Node &&
        !statusContainerRef.current.contains(event.target)
      ) {
        setStatusOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setStatusOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [statusOpen]);

  debugRuntime("ModuleRecordHeader rendered", {
    recordTitle,
    primaryNameField: entity.primaryNameField,
    hasStatusGroup,
    statusOpen,
    statusGroupDisabled,
    owner: statusSummary.owner,
    status: statusSummary.status,
    subStatus: statusSummary.subStatus,
  });

  return (
    <header className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-muted">
            {entity.displayName}
          </p>
          <h2 className="mt-2 truncate text-xl font-semibold text-foreground">
            {recordTitle}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm leading-6 text-muted">{subtitle}</p>
          ) : null}
          {formSelector ? <div className="mt-3">{formSelector}</div> : null}
        </div>

        {hasStatusGroup && statusGroupConfig ? (
          <div
            className="relative w-full min-w-0 lg:w-[320px] lg:shrink-0"
            ref={statusContainerRef}
          >
            <ModuleRecordStatusSummary
              disabledReason={statusGroupConfig.disabledReason}
              onToggle={() => setStatusOpen((current) => !current)}
              open={statusOpen}
              owner={statusSummary.owner}
              status={statusSummary.status}
              subStatus={statusSummary.subStatus}
            />
            {statusOpen ? (
              <ModuleRecordStatusPopover
                config={statusGroupConfig}
                disabled={statusGroupDisabled}
                record={record}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

/*
 * Common name shapes, tried in order, before giving up on the entity label.
 * Deliberately conservative: only fields that unambiguously name a record.
 */
const NAME_FIELD_CANDIDATES = [
  "fullName",
  "name",
  "displayName",
  "title",
  "preferredName",
  "employeeName",
  "code",
  "employeeCode",
  "reference",
];

function composeRecordName(
  record: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!record) return undefined;

  const firstName = formatValue(record.firstName);
  const lastName = formatValue(record.lastName);
  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(" ");
  }

  for (const field of NAME_FIELD_CANDIDATES) {
    const value = formatValue(record[field]);
    if (value) return value;
  }

  return undefined;
}
