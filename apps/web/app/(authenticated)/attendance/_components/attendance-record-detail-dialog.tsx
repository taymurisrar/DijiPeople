"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AttendanceEntryRecord,
  AttendanceEntryStatus,
  AttendanceMode,
} from "../types";
import { Button } from "@/app/components/ui/button";
import { formatDateWithTenantSettings } from "@/lib/date-format";
import { formatDateTime } from "@/lib/formatting-context";
import { AttendanceStatusBadge } from "./attendance-status-badge";

type AttendanceRecordDetailDialogProps = {
  open: boolean;
  recordId: string | null;
  canOverride: boolean;
  formatting: {
    dateFormat: string;
    locale: string;
    timezone: string;
  };
  onClose: () => void;
};

type OverrideForm = {
  date: string;
  checkInTime: string;
  checkOutTime: string;
  attendanceMode: AttendanceMode;
  status: AttendanceEntryStatus;
  checkInNote: string;
  checkOutNote: string;
  workSummary: string;
  adjustmentReason: string;
};

export function AttendanceRecordDetailDialog({
  open,
  recordId,
  canOverride,
  formatting,
  onClose,
}: AttendanceRecordDetailDialogProps) {
  const [record, setRecord] = useState<AttendanceEntryRecord | null>(null);
  const [form, setForm] = useState<OverrideForm | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !recordId) return;

    let cancelled = false;
    async function loadRecord() {
      setIsLoading(true);
      setError(null);
      setMessage(null);

      try {
        const response = await fetch(`/api/attendance/${recordId}`, {
          credentials: "include",
        });
        const data = (await response.json().catch(() => null)) as
          | AttendanceEntryRecord
          | { message?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            data && "message" in data && data.message
              ? data.message
              : "Unable to load attendance record.",
          );
        }

        if (!cancelled) {
          const nextRecord = data as AttendanceEntryRecord;
          setRecord(nextRecord);
          setForm(buildOverrideForm(nextRecord));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load attendance record.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadRecord();

    return () => {
      cancelled = true;
    };
  }, [open, recordId]);

  const canSave = useMemo(() => {
    if (!canOverride || !form) return false;
    return form.adjustmentReason.trim().length > 0;
  }, [canOverride, form]);

  if (!open) {
    return null;
  }

  async function saveOverride() {
    if (!recordId || !form) return;

    if (!form.adjustmentReason.trim()) {
      setError("Override reason is required.");
      return;
    }

    if (
      form.checkInTime &&
      form.checkOutTime &&
      form.checkOutTime < form.checkInTime
    ) {
      setError("Check-out time cannot be earlier than check-in time.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/attendance/${recordId}/override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          date: form.date,
          checkInTime: form.checkInTime || undefined,
          checkOutTime: form.checkOutTime || undefined,
          attendanceMode: form.attendanceMode,
          status: form.status,
          checkInNote: form.checkInNote || undefined,
          checkOutNote: form.checkOutNote || undefined,
          workSummary: form.workSummary || undefined,
          adjustmentReason: form.adjustmentReason,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | AttendanceEntryRecord
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data && "message" in data && data.message
            ? data.message
            : "Unable to save attendance override.",
        );
      }

      setRecord(data as AttendanceEntryRecord);
      setForm(buildOverrideForm(data as AttendanceEntryRecord));
      setMessage("Attendance override saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save attendance override.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[28px] border border-border bg-white shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-border bg-surface-strong px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Attendance record
            </p>
            <h3 className="mt-1 text-xl font-semibold text-foreground">
              {record?.employee.fullName ?? "Loading record"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-white"
          >
            Close
          </button>
        </div>

        <div className="max-h-[calc(92vh-92px)] overflow-y-auto p-6">
          {isLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-16 animate-pulse rounded-2xl bg-surface-strong"
                />
              ))}
            </div>
          ) : record ? (
            <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
              <section className="grid gap-4 md:grid-cols-2">
                <DetailItem label="Employee" value={record.employee.fullName} />
                <DetailItem
                  label="Employee ID"
                  value={record.employee.employeeCode}
                />
                <DetailItem
                  label="Department"
                  value={record.employee.department?.name ?? "Not assigned"}
                />
                <DetailItem
                  label="Job title"
                  value={record.employee.designation?.name ?? "Not assigned"}
                />
                <DetailItem
                  label="Attendance date"
                  value={formatDateWithTenantSettings(
                    record.attendanceDate,
                    formatting,
                  )}
                />
                <DetailItem
                  label="Status"
                  value={<AttendanceStatusBadge status={record.status} />}
                />
                <DetailItem
                  label="Check in"
                  value={
                    record.checkInAt
                      ? formatDateTime(record.checkInAt, formatting)
                      : "Not recorded"
                  }
                />
                <DetailItem
                  label="Check out"
                  value={
                    record.checkOutAt
                      ? formatDateTime(record.checkOutAt, formatting)
                      : "Pending"
                  }
                />
                <DetailItem
                  label="Mode"
                  value={formatValue(record.attendanceMode)}
                />
                <DetailItem
                  label="Office location"
                  value={
                    record.officeLocation?.name ??
                    record.remoteAddressText ??
                    "No location"
                  }
                />
                <DetailItem
                  label="Worked duration"
                  value={record.durationLabel ?? "Open"}
                />
                <DetailItem
                  label="Late by"
                  value={
                    record.lateCheckInMinutes
                      ? `${record.lateCheckInMinutes} min`
                      : "Not late"
                  }
                />
                <DetailItem
                  label="Source / Device"
                  value={record.machineDeviceId ?? record.source}
                />
                <DetailItem
                  label="Created on"
                  value={formatDateTime(record.createdAt, formatting)}
                />
                <DetailItem
                  label="Updated on"
                  value={formatDateTime(record.updatedAt, formatting)}
                />
                <DetailItem
                  label="Check-in note"
                  value={record.checkInNote ?? "None"}
                />
                <DetailItem
                  label="Check-out note"
                  value={record.checkOutNote ?? "None"}
                />
                <DetailItem
                  label="Work summary"
                  value={record.workSummary ?? "None"}
                />
                <DetailItem
                  label="Notes / audit comments"
                  value={record.notes ?? "None"}
                />
              </section>

              <section className="rounded-3xl border border-border bg-surface p-5">
                <h4 className="text-base font-semibold text-foreground">
                  {canOverride ? "Override attendance" : "Read-only access"}
                </h4>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {canOverride
                    ? "Changes require a reason and are saved through the secured attendance API."
                    : "Your role can view this record but cannot edit or override it."}
                </p>

                {canOverride && form ? (
                  <div className="mt-5 grid gap-3">
                    <Field label="Date">
                      <input
                        type="date"
                        value={form.date}
                        onChange={(event) =>
                          setForm({ ...form, date: event.target.value })
                        }
                        className="input"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Check in">
                        <input
                          type="time"
                          value={form.checkInTime}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              checkInTime: event.target.value,
                            })
                          }
                          className="input"
                        />
                      </Field>
                      <Field label="Check out">
                        <input
                          type="time"
                          value={form.checkOutTime}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              checkOutTime: event.target.value,
                            })
                          }
                          className="input"
                        />
                      </Field>
                    </div>
                    <Field label="Mode">
                      <select
                        value={form.attendanceMode}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            attendanceMode: event.target
                              .value as AttendanceMode,
                          })
                        }
                        className="input"
                      >
                        {[
                          "OFFICE",
                          "REMOTE",
                          "HYBRID",
                          "MACHINE",
                          "MANUAL",
                        ].map((mode) => (
                          <option key={mode} value={mode}>
                            {formatValue(mode)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Status">
                      <select
                        value={form.status}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            status: event.target.value as AttendanceEntryStatus,
                          })
                        }
                        className="input"
                      >
                        {[
                          "CHECKED_IN",
                          "CHECKED_OUT",
                          "PRESENT",
                          "LATE",
                          "ABSENT",
                          "HALF_DAY",
                          "MISSED_CHECK_OUT",
                          "ON_LEAVE",
                        ].map((status) => (
                          <option key={status} value={status}>
                            {formatValue(status)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Work summary">
                      <textarea
                        value={form.workSummary}
                        onChange={(event) =>
                          setForm({ ...form, workSummary: event.target.value })
                        }
                        className="input min-h-20"
                      />
                    </Field>
                    <Field label="Override reason">
                      <textarea
                        value={form.adjustmentReason}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            adjustmentReason: event.target.value,
                          })
                        }
                        className="input min-h-24"
                        placeholder="Required for audit history."
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={!canSave || isSaving}
                      loading={isSaving}
                      loadingText="Saving..."
                      onClick={saveOverride}
                    >
                      Save override
                    </Button>
                  </div>
                ) : null}

                {error ? (
                  <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                    {error}
                  </p>
                ) : null}
                {message ? (
                  <p className="mt-4 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-accent">
                    {message}
                  </p>
                ) : null}
              </section>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Attendance record could not be loaded.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-2 text-sm font-medium text-foreground">{value}</div>
    </article>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function buildOverrideForm(record: AttendanceEntryRecord): OverrideForm {
  return {
    date: record.attendanceDate.slice(0, 10),
    checkInTime: toTimeInputValue(record.checkInAt),
    checkOutTime: toTimeInputValue(record.checkOutAt),
    attendanceMode: record.attendanceMode,
    status: record.status,
    checkInNote: record.checkInNote ?? "",
    checkOutNote: record.checkOutNote ?? "",
    workSummary: record.workSummary ?? "",
    adjustmentReason: "",
  };
}

function toTimeInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(11, 16);
}

function formatValue(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
