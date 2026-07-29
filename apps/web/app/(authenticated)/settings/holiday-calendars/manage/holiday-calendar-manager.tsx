"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import {
  CheckboxField,
  DateField,
  LookupField,
  SelectField,
  TextAreaField,
  TextField,
  type LookupOption,
} from "@/app/components/ui/form-control";

type ApiLookupOption = {
  id?: string;
  code?: string | null;
  name?: string | null;
  label?: string | null;
  key?: string | null;
};

type HolidayItem = {
  id: string;
  name: string;
  description?: string | null;
  holidayDate: string;
  type?: string;
  scopeType?: string;
  departmentId?: string | null;
  locationId?: string | null;
  isPaid?: boolean;
  isActive?: boolean;
  isRecurring?: boolean;
  isHalfDay?: boolean;
  halfDayPeriod?: string | null;
  status?: string;
};

export type HolidayCalendarItem = {
  id: string;
  name: string;
  code: string | null;
  description?: string | null;
  countryCode?: string | null;
  regionCode?: string | null;
  timezone?: string | null;
  weekendDays?: string[];
  organizationId?: string | null;
  businessUnitId?: string | null;
  projectId?: string | null;
  isDefault?: boolean;
  status?: string;
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

type HolidayFormState = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  type: string;
  scopeType: string;
  departmentId: string;
  locationId: string;
  isPaid: boolean;
  isActive: boolean;
  isRecurring: boolean;
  isHalfDay: boolean;
  halfDayPeriod: string;
};

const holidayTypeOptions = ["PUBLIC", "COMPANY", "OPTIONAL", "RELIGIOUS", "REGIONAL"].map(
  (type) => ({ id: type, name: titleCase(type) }),
);

const holidayScopeOptions = [
  { id: "TENANT", name: "Everyone" },
  { id: "DEPARTMENT", name: "Department" },
  { id: "WORK_SITE", name: "Work site" },
];

const initialHoliday: HolidayFormState = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  type: "PUBLIC",
  scopeType: "TENANT",
  departmentId: "",
  locationId: "",
  isPaid: true,
  isActive: true,
  isRecurring: false,
  isHalfDay: false,
  halfDayPeriod: "",
};

export function HolidayCalendarManager() {
  const [calendars, setCalendars] = useState<HolidayCalendarItem[]>([]);
  const [departments, setDepartments] = useState<LookupOption[]>([]);
  const [locations, setLocations] = useState<LookupOption[]>([]);
  const [workSchedules, setWorkSchedules] = useState<WorkScheduleItem[]>([]);
  const [calendarId, setCalendarId] = useState("");
  const [scheduleToConnectId, setScheduleToConnectId] = useState("");
  const [items, setItems] = useState<Record<string, HolidayItem[]>>({});
  const [editing, setEditing] = useState<HolidayItem | null>(null);
  const [holiday, setHoliday] = useState<HolidayFormState>(initialHoliday);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingHoliday, setIsSavingHoliday] = useState(false);
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);

  const selected = useMemo(
    () => calendars.find((item) => item.id === calendarId) ?? null,
    [calendarId, calendars],
  );
  const holidays = items[calendarId] ?? [];
  const connectedSchedules = useMemo(
    () =>
      selected
        ? workSchedules.filter(
            (schedule) => schedule.holidayCalendarId === selected.id,
          )
        : [],
    [selected, workSchedules],
  );
  const availableSchedules = useMemo(
    () =>
      selected
        ? workSchedules.filter(
            (schedule) => schedule.holidayCalendarId !== selected.id,
          )
        : [],
    [selected, workSchedules],
  );

  const holidayColumns = useMemo<DataTableColumn<HolidayItem>[]>(
    () => [
      {
        key: "name",
        header: "Holiday",
        sortable: true,
        searchable: true,
        render: (row) => <span className="font-medium">{row.name}</span>,
      },
      {
        key: "holidayDate",
        header: "Date",
        sortable: true,
        filterType: "date",
        render: (row) => row.holidayDate.slice(0, 10),
      },
      {
        key: "type",
        header: "Type",
        sortable: true,
        filterType: "select",
        filterOptions: holidayTypeOptions.map((option) => ({
          label: option.name,
          value: option.id,
        })),
        render: (row) => titleCase(row.type ?? "PUBLIC"),
      },
      {
        key: "isPaid",
        header: "Paid",
        sortable: true,
        filterType: "select",
        filterOptions: [
          { label: "Paid", value: "true" },
          { label: "Unpaid", value: "false" },
        ],
        render: (row) => (row.isPaid === false ? "No" : "Yes"),
      },
      {
        key: "scopeType",
        header: "Scope",
        sortable: true,
        render: (row) => titleCase(row.scopeType ?? "TENANT"),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div className="flex gap-3">
            <button
              className="text-sm font-medium text-accent"
              onClick={() => startEdit(row)}
              type="button"
            >
              Edit
            </button>
            <button
              className="text-sm font-medium text-danger"
              onClick={() => void removeHoliday(row.id)}
              type="button"
            >
              Delete
            </button>
          </div>
        ),
      },
    ],
    [calendarId],
  );

  const workScheduleColumns = useMemo<DataTableColumn<WorkScheduleItem>[]>(
    () => [
      {
        key: "name",
        header: "Work schedule",
        sortable: true,
        searchable: true,
        render: (row) => <span className="font-medium">{row.name}</span>,
      },
      {
        key: "code",
        header: "Code",
        sortable: true,
        render: (row) => row.code ?? "Not set",
      },
      {
        key: "defaultShiftTemplateId",
        header: "Default shift",
        render: (row) => (row.defaultShiftTemplateId ? "Configured" : "Not set"),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <button
            className="text-sm font-medium text-danger disabled:opacity-60"
            disabled={isUpdatingSchedule}
            onClick={() => void disconnectWorkSchedule(row.id)}
            type="button"
          >
            Disconnect
          </button>
        ),
      },
    ],
    [isUpdatingSchedule],
  );

  async function loadSupportingData(commit: (next: () => void) => void) {
    const [
      departmentResult,
      locationResult,
      workScheduleResult,
    ] = await Promise.allSettled([
      fetchJsonList<ApiLookupOption>("/api/departments"),
      fetchJsonList<ApiLookupOption>("/api/locations"),
      fetchJsonList<WorkScheduleItem>("/api/work-schedules"),
    ]);

    commit(() => {
      if (departmentResult.status === "fulfilled") {
        setDepartments(toLookupOptions(departmentResult.value));
      }
      if (locationResult.status === "fulfilled") {
        setLocations(toLookupOptions(locationResult.value));
      }
      if (workScheduleResult.status === "fulfilled") {
        setWorkSchedules(workScheduleResult.value);
      }
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const calendarPayload =
          await fetchJsonList<HolidayCalendarItem>("/api/holiday-calendars");
        const activeCalendars = calendarPayload.filter(
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
                (item) => !hasArchivedStatus(item),
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

  function resetHoliday() {
    setEditing(null);
    setHoliday(initialHoliday);
  }

  function startEdit(item: HolidayItem) {
    setEditing(item);
    setHoliday({
      name: item.name,
      description: item.description ?? "",
      startDate: item.holidayDate.slice(0, 10),
      endDate: item.holidayDate.slice(0, 10),
      type: item.type ?? "PUBLIC",
      scopeType: item.scopeType ?? "TENANT",
      departmentId: item.departmentId ?? "",
      locationId: item.locationId ?? "",
      isPaid: item.isPaid ?? true,
      isActive: item.isActive ?? true,
      isRecurring: item.isRecurring ?? false,
      isHalfDay: item.isHalfDay ?? false,
      halfDayPeriod: item.halfDayPeriod ?? "",
    });
  }

  async function saveHoliday(event: FormEvent) {
    event.preventDefault();
    if (!calendarId) return;

    setError(null);
    setMessage(null);
    setIsSavingHoliday(true);

    try {
      if (holiday.scopeType === "DEPARTMENT" && !holiday.departmentId) {
        throw new Error("Select a department for this holiday scope.");
      }
      if (holiday.scopeType === "WORK_SITE" && !holiday.locationId) {
        throw new Error("Select a work site for this holiday scope.");
      }

      if (editing) {
        const payload = await persistHoliday(
          `/api/holiday-calendars/${calendarId}/holidays/${editing.id}`,
          "PATCH",
          holiday.startDate,
        );
        setItems((current) => ({
          ...current,
          [calendarId]: (current[calendarId] ?? []).map((item) =>
            item.id === payload.id ? payload : item,
          ),
        }));
        setMessage("Holiday updated.");
      } else {
        const dates = enumerateDates(holiday.startDate, holiday.endDate || holiday.startDate);
        const created: HolidayItem[] = [];

        for (const date of dates) {
          created.push(
            await persistHoliday(
              `/api/holiday-calendars/${calendarId}/holidays`,
              "POST",
              date,
            ),
          );
        }

        setItems((current) => ({
          ...current,
          [calendarId]: [...(current[calendarId] ?? []), ...created],
        }));
        setMessage(
          created.length > 1
            ? `${created.length} holiday dates added.`
            : "Holiday added.",
        );
      }

      resetHoliday();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to save holiday.",
      );
    } finally {
      setIsSavingHoliday(false);
    }
  }

  async function persistHoliday(path: string, method: "POST" | "PATCH", date: string) {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: holiday.name,
        description: holiday.description || undefined,
        holidayDate: date,
        type: holiday.type,
        scopeType: holiday.scopeType,
        departmentId:
          holiday.scopeType === "DEPARTMENT" ? holiday.departmentId : null,
        locationId: holiday.scopeType === "WORK_SITE" ? holiday.locationId : null,
        isPaid: holiday.isPaid,
        isActive: holiday.isActive,
        isRecurring: holiday.isRecurring,
        isHalfDay: holiday.isHalfDay,
        halfDayPeriod: holiday.isHalfDay ? holiday.halfDayPeriod || null : null,
        appliesToAll: holiday.scopeType === "TENANT",
        status: "ACTIVE",
      }),
    });
    const payload = await readJson(response);

    if (!response.ok || !isHoliday(payload)) {
      throw new Error(readError(payload, "Unable to save holiday."));
    }

    return payload;
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

  async function connectWorkSchedule() {
    if (!selected || !scheduleToConnectId || isUpdatingSchedule) return;

    await updateWorkScheduleCalendar(scheduleToConnectId, selected.id, {
      successMessage: "Work schedule connected.",
    });
    setScheduleToConnectId("");
  }

  async function disconnectWorkSchedule(scheduleId: string) {
    if (isUpdatingSchedule) return;

    await updateWorkScheduleCalendar(scheduleId, null, {
      successMessage: "Work schedule disconnected.",
    });
  }

  async function updateWorkScheduleCalendar(
    scheduleId: string,
    nextCalendarId: string | null,
    options: { successMessage: string },
  ) {
    setError(null);
    setMessage(null);
    setIsUpdatingSchedule(true);

    try {
      const response = await fetch(
        `/api/work-schedules/${encodeURIComponent(scheduleId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holidayCalendarId: nextCalendarId }),
        },
      );
      const payload = await readJson(response);

      if (!response.ok || !isRecord(payload)) {
        throw new Error(readError(payload, "Unable to update work schedule."));
      }

      setWorkSchedules((current) =>
        current.map((schedule) =>
          schedule.id === scheduleId
            ? {
                ...schedule,
                ...payload,
                holidayCalendarId: nextCalendarId,
                holidayCalendar: nextCalendarId
                  ? {
                      id: nextCalendarId,
                      name: selected?.name ?? schedule.holidayCalendar?.name ?? "",
                      code: selected?.code ?? schedule.holidayCalendar?.code,
                    }
                  : null,
              }
            : schedule,
        ),
      );
      setMessage(options.successMessage);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update work schedule.",
      );
    } finally {
      setIsUpdatingSchedule(false);
    }
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
        <LookupField
          label="Active Work Calendar"
          onChange={(value) => {
            setCalendarId(value);
            resetHoliday();
          }}
          options={calendars.map((calendar) => ({
            id: calendar.id,
            name: calendar.name,
            code: calendar.code,
          }))}
          placeholder="Select calendar"
          value={calendarId}
        />

        {selected ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <SummaryPill label="Scope" value={formatCalendarScope(selected)} />
            <SummaryPill label="Country" value={selected.countryCode} />
            <SummaryPill label="Region" value={selected.regionCode} />
            <SummaryPill label="Timezone" value={selected.timezone} />
            <SummaryPill
              label="Weekend days"
              value={(selected.weekendDays ?? []).map(titleCase).join(", ")}
            />
            <SummaryPill
              label="Connected work schedules"
              value={String(connectedSchedules.length)}
            />
          </div>
        ) : null}
      </section>

      {!selected ? (
        <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted">
          Create a work calendar first, then return here to add holiday dates.
        </p>
      ) : (
        <section className="grid gap-5 rounded-xl border border-border bg-surface p-5">
          <h3 className="text-base font-semibold text-foreground">
            Holidays in {selected.name}
          </h3>
          <form className="grid gap-4 xl:grid-cols-4" onSubmit={saveHoliday}>
            <TextField
              className="xl:col-span-2"
              label="Holiday name"
              onChange={(value) => setHolidayValue("name", value)}
              required
              value={holiday.name}
            />
            <SelectField
              label="Holiday type"
              onChange={(value) => setHolidayValue("type", value || "PUBLIC")}
              options={holidayTypeOptions}
              value={holiday.type}
            />
            <SelectField
              label="Holiday scope"
              onChange={(value) =>
                setHoliday((current) => ({
                  ...current,
                  scopeType: value || "TENANT",
                  departmentId: "",
                  locationId: "",
                }))
              }
              options={holidayScopeOptions}
              value={holiday.scopeType}
            />
            {holiday.scopeType === "DEPARTMENT" ? (
              <LookupField
                label="Department"
                onChange={(value) => setHolidayValue("departmentId", value)}
                options={departments}
                required
                value={holiday.departmentId}
              />
            ) : null}
            {holiday.scopeType === "WORK_SITE" ? (
              <LookupField
                label="Work site"
                onChange={(value) => setHolidayValue("locationId", value)}
                options={locations}
                required
                value={holiday.locationId}
              />
            ) : null}
            <DateField
              label={editing ? "Date" : "Start date"}
              onChange={(value) => setHolidayValue("startDate", value)}
              required
              value={holiday.startDate}
            />
            {!editing ? (
              <DateField
                label="End date"
                min={holiday.startDate || undefined}
                onChange={(value) => setHolidayValue("endDate", value)}
                value={holiday.endDate}
              />
            ) : null}
            <CheckboxField
              checked={holiday.isPaid}
              label="Paid holiday"
              onChange={(checked) => setHolidayValue("isPaid", checked)}
            />
            <CheckboxField
              checked={holiday.isActive}
              label="Active"
              onChange={(checked) => setHolidayValue("isActive", checked)}
            />
            <CheckboxField
              checked={holiday.isRecurring}
              label="Recurring annually"
              onChange={(checked) => setHolidayValue("isRecurring", checked)}
            />
            <CheckboxField
              checked={holiday.isHalfDay}
              label="Half day"
              onChange={(checked) => setHolidayValue("isHalfDay", checked)}
            />
            {holiday.isHalfDay ? (
              <SelectField
                label="Half-day period"
                onChange={(value) => setHolidayValue("halfDayPeriod", value)}
                options={[
                  { id: "MORNING", name: "Morning" },
                  { id: "AFTERNOON", name: "Afternoon" },
                ]}
                value={holiday.halfDayPeriod}
              />
            ) : null}
            <TextAreaField
              className="xl:col-span-4"
              label="Description"
              onChange={(value) => setHolidayValue("description", value)}
              value={holiday.description}
            />
            <div className="flex gap-3 xl:col-span-4">
              <button
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isSavingHoliday}
                type="submit"
              >
                {isSavingHoliday
                  ? "Saving..."
                  : editing
                    ? "Update Holiday"
                    : "Add Holiday"}
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

          <DataTable
            columns={holidayColumns}
            emptyState={<p className="p-5 text-sm text-muted">No holidays in this calendar.</p>}
            enableSearch
            entityLogicalName="holiday-calendar-holidays"
            getRowKey={(row) => row.id}
            pagination={{ page: 1, pageSize: 10, totalItems: holidays.length }}
            rows={holidays}
            searchPlaceholder="Search holidays"
          />
        </section>
      )}

      {selected ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-base font-semibold text-foreground">
            Connected Work Schedules
          </h3>
          <p className="mt-1 text-sm text-muted">
            Work schedules are the active operational calendars. They reference
            this holiday calendar to suppress or adjust planned work days.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <LookupField
              label="Connect work schedule"
              onChange={setScheduleToConnectId}
              options={availableSchedules.map((schedule) => ({
                id: schedule.id,
                name: schedule.name,
                code: schedule.code,
              }))}
              placeholder="Select schedule"
              value={scheduleToConnectId}
            />
            <div className="flex items-end">
              <button
                className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                disabled={!scheduleToConnectId || isUpdatingSchedule}
                onClick={() => void connectWorkSchedule()}
                type="button"
              >
                {isUpdatingSchedule ? "Updating..." : "Connect"}
              </button>
            </div>
          </div>
          <div className="mt-4">
            <DataTable
              columns={workScheduleColumns}
              emptyState={
                <p className="p-5 text-sm text-muted">
                  This calendar is not assigned to a work schedule yet.
                </p>
              }
              enableSearch
              entityLogicalName="holiday-calendar-work-schedules"
              getRowKey={(row) => row.id}
              pagination={{
                page: 1,
                pageSize: 10,
                totalItems: connectedSchedules.length,
              }}
              rows={connectedSchedules}
              searchPlaceholder="Search work schedules"
            />
          </div>
        </section>
      ) : null}
    </div>
  );

  function setHolidayValue<Key extends keyof HolidayFormState>(
    key: Key,
    value: HolidayFormState[Key],
  ) {
    setHoliday((current) => ({ ...current, [key]: value }));
  }
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

async function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

async function fetchJsonList<T>(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(readError(payload, `Unable to load ${path}.`));
  }
  if (Array.isArray(payload)) return payload as T[];
  if (isRecord(payload) && Array.isArray(payload.items)) return payload.items as T[];
  if (isRecord(payload) && Array.isArray(payload.data)) return payload.data as T[];
  return [];
}

function toLookupOptions(
  items: ApiLookupOption[],
  valuePreference: "id" | "code" = "id",
): LookupOption[] {
  return items.reduce<LookupOption[]>((options, item) => {
    const preferred = valuePreference === "code" ? item.code : item.id;
    const fallback = valuePreference === "code" ? item.id : item.code;
    const id = preferred ?? fallback ?? item.key ?? "";
    const name = item.name ?? item.label ?? item.code ?? id;

    if (id) {
      options.push({
        id,
        name,
        code: item.code ?? null,
        key: item.key ?? null,
      });
    }

    return options;
  }, []);
}

function readError(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.message === "string"
    ? payload.message
    : fallback;
}

function isHoliday(value: unknown): value is HolidayItem {
  return Boolean(
    isRecord(value) &&
      typeof value.id === "string" &&
      typeof value.name === "string" &&
      typeof value.holidayDate === "string",
  );
}

function hasArchivedStatus(value: unknown) {
  return Boolean(isRecord(value) && value.status === "ARCHIVED");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function enumerateDates(start: string, end: string) {
  if (!start) return [];
  const startDate = parseDate(start);
  const endDate = parseDate(end || start);
  if (!startDate || !endDate || endDate < startDate) return [start];

  const dates: string[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCalendarScope(calendar: HolidayCalendarItem) {
  if (calendar.projectId) return "Project / team";
  if (calendar.businessUnitId) return "Business unit";
  if (calendar.organizationId) return "Organization";
  return "Tenant wide";
}
