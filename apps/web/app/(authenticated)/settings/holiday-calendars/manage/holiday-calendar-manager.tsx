"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type LookupOption = {
  id?: string;
  code?: string;
  name?: string;
  label?: string;
};

type HolidayItem = {
  id: string;
  name: string;
  holidayDate: string;
  type?: string;
  isPaid?: boolean;
  isActive?: boolean;
};

export type HolidayCalendarItem = {
  id: string;
  name: string;
  code: string | null;
  countryCode?: string | null;
  regionCode?: string | null;
  timezone?: string | null;
  weekendDays?: string[];
  isDefault?: boolean;
  holidays?: HolidayItem[];
};

type WorkScheduleItem = {
  id: string;
  name: string;
  code?: string | null;
  holidayCalendarId?: string | null;
  defaultShiftTemplateId?: string | null;
  holidayCalendar?: {
    id: string;
    name: string;
    code?: string | null;
  } | null;
};

const weekdayOptions = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

export function HolidayCalendarManager() {
  const [calendars, setCalendars] = useState<HolidayCalendarItem[]>([]);
  const [countries, setCountries] = useState<LookupOption[]>([]);
  const [timezones, setTimezones] = useState<LookupOption[]>([]);
  const [workSchedules, setWorkSchedules] = useState<WorkScheduleItem[]>([]);
  const [calendarId, setCalendarId] = useState("");
  const [items, setItems] = useState<Record<string, HolidayItem[]>>({});
  const [editing, setEditing] = useState<HolidayItem | null>(null);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [calendarName, setCalendarName] = useState("");
  const [calendarCode, setCalendarCode] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [weekendDays, setWeekendDays] = useState<string[]>([
    "SATURDAY",
    "SUNDAY",
  ]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCalendar, setIsSavingCalendar] = useState(false);

  const selected = useMemo(
    () => calendars.find((item) => item.id === calendarId) ?? null,
    [calendarId, calendars],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const calendarResponse = await fetch("/api/holiday-calendars", {
          cache: "no-store",
        });
        const calendarPayload = await readJson(calendarResponse);

        if (!calendarResponse.ok || !Array.isArray(calendarPayload)) {
          throw new Error(readError(calendarPayload, "Unable to load calendars."));
        }

        const activeCalendars = (calendarPayload as HolidayCalendarItem[]).filter(
          (calendar) => !hasArchivedStatus(calendar),
        );

        if (cancelled) return;
        setCalendars(activeCalendars);
        setCalendarId((current) => current || activeCalendars[0]?.id || "");
        setItems(
          Object.fromEntries(
            activeCalendars.map((calendar) => [
              calendar.id,
              (calendar.holidays ?? []).filter(
                (holiday) => !hasArchivedStatus(holiday),
              ),
            ]),
          ),
        );

        void loadSupportingData((next) => {
          if (!cancelled) next();
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load holiday calendars.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadSupportingData(commit: (next: () => void) => void) {
    const [countryResult, timezoneResult, workScheduleResult] =
      await Promise.allSettled([
        fetchJsonArray<LookupOption>("/api/lookups/countries"),
        fetchJsonArray<LookupOption>("/api/configuration/timezones"),
        fetchJsonArray<WorkScheduleItem>("/api/work-schedules"),
      ]);

    commit(() => {
      if (countryResult.status === "fulfilled") {
        setCountries(countryResult.value);
      }
      if (timezoneResult.status === "fulfilled") {
        setTimezones(timezoneResult.value);
      }
      if (workScheduleResult.status === "fulfilled") {
        setWorkSchedules(workScheduleResult.value);
      }
    });
  }

  function resetHoliday() {
    setEditing(null);
    setHolidayName("");
    setHolidayDate("");
  }

  async function createCalendar(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSavingCalendar(true);

    try {
      const response = await fetch("/api/holiday-calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: calendarName,
          code: calendarCode || calendarName,
          countryCode: countryCode || undefined,
          regionCode: regionCode || undefined,
          timezone,
          weekendDays,
          isDefault: calendars.length === 0,
          status: "ACTIVE",
        }),
      });
      const payload = await readJson(response);

      if (!response.ok || !isHolidayCalendar(payload)) {
        throw new Error(readError(payload, "Unable to create holiday calendar."));
      }

      setCalendars((current) => [payload, ...current]);
      setItems((current) => ({ ...current, [payload.id]: payload.holidays ?? [] }));
      setCalendarId(payload.id);
      setCalendarName("");
      setCalendarCode("");
      setRegionCode("");
      setMessage("Holiday calendar created.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create holiday calendar.",
      );
    } finally {
      setIsSavingCalendar(false);
    }
  }

  async function saveHoliday(event: FormEvent) {
    event.preventDefault();
    if (!calendarId) return;

    setError(null);
    setMessage(null);
    const path = editing
      ? `/api/holiday-calendars/${calendarId}/holidays/${editing.id}`
      : `/api/holiday-calendars/${calendarId}/holidays`;
    const response = await fetch(path, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: holidayName,
        holidayDate,
        type: "PUBLIC",
        isPaid: true,
        isActive: true,
      }),
    });
    const payload = await readJson(response);

    if (!response.ok || !isHoliday(payload)) {
      setError(readError(payload, "Unable to save holiday."));
      return;
    }

    setItems((current) => ({
      ...current,
      [calendarId]: editing
        ? (current[calendarId] ?? []).map((item) =>
            item.id === payload.id ? payload : item,
          )
        : [...(current[calendarId] ?? []), payload],
    }));
    setMessage(editing ? "Holiday updated." : "Holiday added.");
    resetHoliday();
  }

  async function removeHoliday(id: string) {
    const response = await fetch(
      `/api/holiday-calendars/${calendarId}/holidays/${id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const payload = await readJson(response);
      setError(readError(payload, "Unable to delete holiday."));
      return;
    }
    setItems((current) => ({
      ...current,
      [calendarId]: (current[calendarId] ?? []).filter((item) => item.id !== id),
    }));
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
        Loading holiday calendars...
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-accent">
          {message}
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-base font-semibold text-foreground">
          Regional Holiday Calendar
        </h3>
        <form className="mt-4 grid gap-4 lg:grid-cols-3" onSubmit={createCalendar}>
          <Field label="Name">
            <input
              required
              className={inputClassName}
              value={calendarName}
              onChange={(event) => setCalendarName(event.target.value)}
            />
          </Field>
          <Field label="Code">
            <input
              className={inputClassName}
              value={calendarCode}
              onChange={(event) => setCalendarCode(event.target.value)}
              placeholder="Auto from name"
            />
          </Field>
          <Field label="Country">
            <select
              className={inputClassName}
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
            >
              <option value="">Tenant-wide</option>
              {countries.map((country) => {
                const code = country.code ?? country.id ?? "";
                return code ? (
                  <option key={code} value={code}>
                    {country.name ?? country.label ?? code}
                  </option>
                ) : null;
              })}
            </select>
          </Field>
          <Field label="Region">
            <input
              className={inputClassName}
              value={regionCode}
              onChange={(event) => setRegionCode(event.target.value)}
              placeholder="Province, state, or region code"
            />
          </Field>
          <Field label="Timezone">
            <select
              className={inputClassName}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              <option value="UTC">UTC</option>
              {timezones.map((item) => {
                const value = item.id ?? item.code ?? item.name ?? item.label ?? "";
                return value ? (
                  <option key={value} value={value}>
                    {item.name ?? item.label ?? value}
                  </option>
                ) : null;
              })}
            </select>
          </Field>
          <Field label="Weekend Days">
            <select
              className={inputClassName}
              multiple
              value={weekendDays}
              onChange={(event) =>
                setWeekendDays(
                  Array.from(event.currentTarget.selectedOptions).map(
                    (option) => option.value,
                  ),
                )
              }
            >
              {weekdayOptions.map((day) => (
                <option key={day} value={day}>
                  {titleCase(day)}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button
              className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isSavingCalendar}
              type="submit"
            >
              {isSavingCalendar ? "Creating..." : "Create Calendar"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <label className="grid gap-2 text-sm font-medium text-foreground">
          Active holiday calendar
          <select
            className="max-w-xl rounded-xl border border-border bg-white px-4 py-3"
            value={calendarId}
            onChange={(event) => {
              setCalendarId(event.target.value);
              resetHoliday();
            }}
          >
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name} ({calendar.code ?? "No code"})
              </option>
            ))}
          </select>
        </label>

        {selected ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <SummaryPill label="Country" value={selected.countryCode} />
            <SummaryPill label="Region" value={selected.regionCode} />
            <SummaryPill label="Timezone" value={selected.timezone} />
            <SummaryPill
              label="Work schedules"
              value={String(
                workSchedules.filter(
                  (schedule) => schedule.holidayCalendarId === selected.id,
                ).length,
              )}
            />
          </div>
        ) : null}
      </section>

      {!selected ? (
        <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted">
          Create a holiday calendar before adding holidays.
        </p>
      ) : (
        <section className="grid gap-5 rounded-xl border border-border bg-surface p-5">
          <h3 className="text-base font-semibold text-foreground">
            Holidays in {selected.name}
          </h3>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={saveHoliday}>
            <Field label="Holiday name">
              <input
                required
                className={inputClassName}
                value={holidayName}
                onChange={(event) => setHolidayName(event.target.value)}
              />
            </Field>
            <Field label="Date">
              <input
                required
                type="date"
                className={inputClassName}
                value={holidayDate}
                onChange={(event) => setHolidayDate(event.target.value)}
              />
            </Field>
            <div className="flex gap-3 md:col-span-2">
              <button
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
                type="submit"
              >
                {editing ? "Update Holiday" : "Add Holiday"}
              </button>
              {editing ? (
                <button
                  className="rounded-xl border border-border px-4 py-2 text-sm"
                  onClick={resetHoliday}
                  type="button"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/5">
                <tr>
                  <th className="p-4">Holiday</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(items[calendarId] ?? []).map((item) => (
                  <tr key={item.id}>
                    <td className="p-4 font-medium">{item.name}</td>
                    <td className="p-4">{item.holidayDate.slice(0, 10)}</td>
                    <td className="p-4">{item.type ?? "PUBLIC"}</td>
                    <td className="p-4">
                      <div className="flex gap-3">
                        <button
                          className="text-accent"
                          onClick={() => {
                            setEditing(item);
                            setHolidayName(item.name);
                            setHolidayDate(item.holidayDate.slice(0, 10));
                          }}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="text-danger"
                          onClick={() => void removeHoliday(item.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(items[calendarId] ?? []).length === 0 ? (
              <p className="p-5 text-sm text-muted">
                No holidays in this calendar.
              </p>
            ) : null}
          </div>
        </section>
      )}

      {selected ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-base font-semibold text-foreground">
            Connected Work Schedules
          </h3>
          <p className="mt-1 text-sm text-muted">
            Shifts are applied through work schedules; the holiday calendar is
            referenced there to suppress or adjust planned work days.
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/5">
                <tr>
                  <th className="p-4">Work schedule</th>
                  <th className="p-4">Code</th>
                  <th className="p-4">Default shift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workSchedules
                  .filter((schedule) => schedule.holidayCalendarId === selected.id)
                  .map((schedule) => (
                    <tr key={schedule.id}>
                      <td className="p-4 font-medium">{schedule.name}</td>
                      <td className="p-4">{schedule.code ?? "Not set"}</td>
                      <td className="p-4">
                        {schedule.defaultShiftTemplateId ? "Configured" : "Not set"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {workSchedules.filter(
              (schedule) => schedule.holidayCalendarId === selected.id,
            ).length === 0 ? (
              <p className="p-5 text-sm text-muted">
                This calendar is not assigned to a work schedule yet.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SummaryPill({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {value || "Not set"}
      </p>
    </div>
  );
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClassName =
  "w-full rounded-xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

async function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

async function fetchJsonArray<T>(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  const payload = await readJson(response);
  if (!response.ok || !Array.isArray(payload)) return [];
  return payload as T[];
}

function readError(payload: unknown, fallback: string) {
  return payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
    ? payload.message
    : fallback;
}

function isHolidayCalendar(value: unknown): value is HolidayCalendarItem {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      "name" in value &&
      typeof value.name === "string",
  );
}

function isHoliday(value: unknown): value is HolidayItem {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      "name" in value &&
      typeof value.name === "string" &&
      "holidayDate" in value &&
      typeof value.holidayDate === "string",
  );
}

function hasArchivedStatus(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "status" in value &&
      value.status === "ARCHIVED",
  );
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
