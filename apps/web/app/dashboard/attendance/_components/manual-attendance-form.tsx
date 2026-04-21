"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  AttendanceLocationOption,
  AttendanceMode,
  ATTENDANCE_MODE_OPTIONS,
  ATTENDANCE_STATUS_OPTIONS,
  TeamEmployeeOption,
} from "../types";

type ManualAttendanceFormProps = {
  employees: TeamEmployeeOption[];
  locations: AttendanceLocationOption[];
};

const initialForm = {
  employeeId: "",
  date: new Date().toISOString().slice(0, 10),
  checkInTime: "",
  checkOutTime: "",
  attendanceMode: "OFFICE" as AttendanceMode,
  officeLocationId: "",
  status: "",
  checkInNote: "",
  checkOutNote: "",
  workSummary: "",
  adjustmentReason: "",
};

export function ManualAttendanceForm({
  employees,
  locations,
}: ManualAttendanceFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.employeeId) {
      setError("Employee is required.");
      return;
    }

    if (!form.adjustmentReason.trim()) {
      setError("Adjustment reason is required for manual attendance.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/attendance/manual", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        employeeId: form.employeeId,
        date: form.date,
        checkInTime: form.checkInTime || undefined,
        checkOutTime: form.checkOutTime || undefined,
        attendanceMode: form.attendanceMode,
        officeLocationId:
          form.attendanceMode === "OFFICE"
            ? form.officeLocationId || undefined
            : undefined,
        status: form.status || undefined,
        checkInNote: form.checkInNote || undefined,
        checkOutNote: form.checkOutNote || undefined,
        workSummary: form.workSummary || undefined,
        adjustmentReason: form.adjustmentReason,
      }),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to create manual attendance entry.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setIsSubmitting(false);
    setForm(initialForm);
  }

  return (
    <form
      className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2 xl:grid-cols-3"
      onSubmit={handleSubmit}
    >
      <SelectField
        label="Employee"
        onChange={(value) =>
          setForm((current) => ({ ...current, employeeId: value }))
        }
        options={employees.map((employee) => ({
          label: `${employee.fullName} (${employee.employeeCode})`,
          value: employee.id,
        }))}
        value={form.employeeId}
      />

      <Field
        label="Date"
        onChange={(value) => setForm((current) => ({ ...current, date: value }))}
        type="date"
        value={form.date}
      />

      <SelectField
        label="Mode"
        onChange={(value) =>
          setForm((current) => ({
            ...current,
            attendanceMode: value as AttendanceMode,
          }))
        }
        options={ATTENDANCE_MODE_OPTIONS.map((mode) => ({
          label: formatValue(mode),
          value: mode,
        }))}
        value={form.attendanceMode}
      />

      {form.attendanceMode === "OFFICE" ? (
        <SelectField
          label="Office location"
          onChange={(value) =>
            setForm((current) => ({ ...current, officeLocationId: value }))
          }
          options={locations.map((location) => ({
            label: `${location.name} (${location.city})`,
            value: location.id,
          }))}
          value={form.officeLocationId}
        />
      ) : null}

      <Field
        label="Check in time"
        onChange={(value) =>
          setForm((current) => ({ ...current, checkInTime: value }))
        }
        type="time"
        value={form.checkInTime}
      />
      <Field
        label="Check out time"
        onChange={(value) =>
          setForm((current) => ({ ...current, checkOutTime: value }))
        }
        type="time"
        value={form.checkOutTime}
      />

      <SelectField
        label="Status override"
        onChange={(value) => setForm((current) => ({ ...current, status: value }))}
        options={ATTENDANCE_STATUS_OPTIONS.map((status) => ({
          label: formatValue(status),
          value: status,
        }))}
        placeholder="Auto-derive from times"
        value={form.status}
      />

      <TextAreaField
        label="Check-in note"
        onChange={(value) =>
          setForm((current) => ({ ...current, checkInNote: value }))
        }
        value={form.checkInNote}
      />
      <TextAreaField
        label="Check-out note"
        onChange={(value) =>
          setForm((current) => ({ ...current, checkOutNote: value }))
        }
        value={form.checkOutNote}
      />
      <TextAreaField
        label="Work summary"
        onChange={(value) =>
          setForm((current) => ({ ...current, workSummary: value }))
        }
        value={form.workSummary}
      />

      <label className="space-y-2 text-sm md:col-span-2 xl:col-span-3">
        <span className="font-medium text-foreground">Adjustment reason</span>
        <textarea
          className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              adjustmentReason: event.target.value,
            }))
          }
          value={form.adjustmentReason}
        />
      </label>

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger md:col-span-2 xl:col-span-3">
          {error}
        </p>
      ) : null}

      <div className="md:col-span-2 xl:col-span-3">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Saving..." : "Create manual entry"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  onChange,
  type,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type: string;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  placeholder = "Select an option",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <select
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <textarea
        className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function formatValue(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
