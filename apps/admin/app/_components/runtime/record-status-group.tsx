"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, UserRound } from "lucide-react";
import type {
  PlatformModuleDefinition,
  RuntimeRecord,
  RuntimeRecordHeaderSlot,
  RuntimeStatusDefinition,
} from "@/lib/runtime/platform-runtime.types";
import { readRuntimeLookupLabel } from "@/lib/runtime/runtime-lookups";
import {
  hasRuntimePermission,
  recordHeaderWritePermission,
} from "@/lib/runtime/runtime-permissions";
import { useRuntimeLookupOptions } from "@/lib/runtime/use-runtime-lookup-options";
import { SearchableSelect } from "./runtime-form";

export type RecordStatusGroupWrite = {
  assign(ownerId: string | null): Promise<{ success: boolean; message?: string }>;
  changeStatus(input: {
    status: string;
    subStatus?: string;
  }): Promise<{ success: boolean; message?: string }>;
};

/**
 * The record header status group.
 *
 * Dynamics 365 puts Owner, Status and Sub-status together at the top right of
 * a record, and it is the first thing an operator looks at: who is answerable
 * for this, what state is it in, and why. Platform Admin used to spread those
 * three across a metadata strip, an action bar and — for some modules — the
 * "Additional details" section of a tab, or not show them at all.
 *
 * The group renders only the slots the module declares (see
 * `defaultRecordHeader` in the registry) and only makes a slot editable when
 * that slot names a governed write route **and** the signed-in platform user
 * holds the permission it is gated on. The permission check here is a
 * usability affordance; the API re-checks every one of these calls.
 */
export function RecordStatusGroup({
  definition,
  record,
  roleKeys,
  permissionKeys,
  write,
  onChanged,
  disabled = false,
}: {
  definition: PlatformModuleDefinition;
  record: RuntimeRecord | Record<string, unknown>;
  roleKeys: string[];
  permissionKeys: string[];
  /**
   * Omitted by the bespoke record pages, which render the group to show Owner,
   * Status and Sub-status but route every change through their own governed
   * controls. Without a write route every slot is read-only — the group never
   * offers an edit it has no way to perform.
   */
  write?: RecordStatusGroupWrite;
  onChanged?: () => Promise<void> | void;
  /** Create mode — there is no record to own or transition yet. */
  disabled?: boolean;
}) {
  const header = definition.recordHeader;
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!header) return null;
  const slots = [header.owner, header.status, header.subStatus].filter(
    (slot): slot is RuntimeRecordHeaderSlot => Boolean(slot),
  );
  if (!slots.length) return null;

  const statusValue = String(
    header.status ? (record[header.status.field] ?? "") : "",
  );

  function canWrite(slot: RuntimeRecordHeaderSlot) {
    if (disabled || !slot.write || !write) return false;
    return hasRuntimePermission(
      recordHeaderWritePermission(definition, slot.write),
      { roleKeys, permissionKeys },
    );
  }

  function run(
    slotField: string,
    operation: () => Promise<{ success: boolean; message?: string }>,
  ) {
    setPendingSlot(slotField);
    setNotice(null);
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await operation();
        setFailed(!result.success);
        setNotice(
          result.message ??
            (result.success ? "Saved." : "The change was not accepted."),
        );
        if (result.success) await onChanged?.();
      } catch (error) {
        setFailed(true);
        setNotice(
          error instanceof Error
            ? error.message
            : "The change could not be saved.",
        );
      } finally {
        setPendingSlot(null);
      }
    });
  }

  return (
    <div className="w-full lg:w-auto lg:min-w-[26rem]">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
        {header.owner ? (
          <OwnerSlot
            slot={header.owner}
            record={record}
            editable={canWrite(header.owner)}
            busy={isPending && pendingSlot === header.owner.field}
            onChange={(ownerId) =>
              run(header.owner!.field, () => write!.assign(ownerId))
            }
          />
        ) : null}
        {header.status ? (
          <OptionSlot
            slot={header.status}
            value={statusValue}
            options={header.status.options ?? []}
            statuses={definition.statuses}
            editable={canWrite(header.status)}
            busy={isPending && pendingSlot === header.status.field}
            onChange={(next) =>
              run(header.status!.field, () =>
                write!.changeStatus({ status: next }),
              )
            }
          />
        ) : null}
        {header.subStatus ? (
          <OptionSlot
            slot={header.subStatus}
            value={String(record[header.subStatus.field] ?? "")}
            options={
              header.subStatus.optionsByStatus
                ? (header.subStatus.optionsByStatus[statusValue] ?? [])
                : (header.subStatus.options ?? [])
            }
            editable={canWrite(header.subStatus)}
            busy={isPending && pendingSlot === header.subStatus.field}
            onChange={(next) =>
              run(header.subStatus!.field, () =>
                write!.changeStatus({ status: statusValue, subStatus: next }),
              )
            }
          />
        ) : null}
      </dl>
      {notice ? (
        <p
          role="status"
          className={`mt-2 text-xs font-medium ${failed ? "text-rose-700" : "text-emerald-700"}`}
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function OwnerSlot({
  slot,
  record,
  editable,
  busy,
  onChange,
}: {
  slot: RuntimeRecordHeaderSlot;
  record: Record<string, unknown>;
  editable: boolean;
  busy: boolean;
  onChange: (ownerId: string | null) => void;
}) {
  /*
   * Options are fetched only once the operator can actually reassign. A
   * read-only header has the owner's name on the record already, so loading a
   * directory of platform users to display one string is a request nobody
   * needed.
   */
  const lookup = useRuntimeLookupOptions(
    editable ? slot.lookupPath : undefined,
  );
  const value = String(record[slot.field] ?? "");
  const label =
    (slot.displayValueField
      ? readRuntimeLookupLabel(record[slot.displayValueField])
      : null) ?? null;
  const options =
    value && label && !lookup.options.some((option) => option.value === value)
      ? [{ value, label }, ...lookup.options]
      : lookup.options;

  return (
    <SlotShell label={slot.label} busy={busy} hint={slot.readOnlyReason}>
      {editable ? (
        <SearchableSelect
          ariaLabel={slot.label}
          options={options}
          value={value}
          placeholder={
            lookup.loading && !options.length ? "Loading…" : "Unassigned"
          }
          onChange={(next) =>
            onChange(typeof next === "string" && next ? next : null)
          }
        />
      ) : (
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <UserRound className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          {label ?? "Unassigned"}
        </span>
      )}
      {lookup.error ? (
        <span className="text-xs text-rose-700" role="alert">
          {lookup.error}
        </span>
      ) : null}
    </SlotShell>
  );
}

function OptionSlot({
  slot,
  value,
  options,
  statuses,
  editable,
  busy,
  onChange,
}: {
  slot: RuntimeRecordHeaderSlot;
  value: string;
  options: Array<{ value: string; label: string }>;
  statuses?: RuntimeStatusDefinition[];
  editable: boolean;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  const definitionForValue = statuses?.find((item) => item.value === value);
  const label =
    definitionForValue?.label ??
    options.find((option) => option.value === value)?.label ??
    (value ? humanize(value) : null);

  return (
    <SlotShell label={slot.label} busy={busy} hint={slot.readOnlyReason}>
      {editable && options.length ? (
        <select
          aria-label={slot.label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-800 outline-none focus:border-[var(--admin-primary)]"
        >
          {value && !options.some((option) => option.value === value) ? (
            <option value={value}>{label ?? value}</option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <StatusValue label={label} tone={definitionForValue?.tone} />
      )}
    </SlotShell>
  );
}

function SlotShell({
  label,
  busy,
  hint,
  children,
}: {
  label: string;
  busy: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0" title={hint}>
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
        {busy ? (
          <LoaderCircle
            className="h-3 w-3 animate-spin text-slate-400"
            aria-label="Saving"
          />
        ) : null}
      </dt>
      <dd className="mt-1 flex flex-col gap-1">{children}</dd>
    </div>
  );
}

/**
 * Tone always carries text, never colour alone — the same rule the tenant
 * status badge follows, and the reason this renders a label rather than a dot.
 */
function StatusValue({
  label,
  tone,
}: {
  label: string | null;
  tone?: RuntimeStatusDefinition["tone"];
}) {
  if (!label)
    return <span className="text-sm text-slate-400">Not set</span>;
  return (
    <span
      className={`inline-flex w-fit max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${TONE_CLASSES[tone ?? "neutral"]}`}
    >
      {label}
    </span>
  );
}

const TONE_CLASSES: Record<
  NonNullable<RuntimeStatusDefinition["tone"]>,
  string
> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-rose-50 text-rose-800 ring-rose-200",
};

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
