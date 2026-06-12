"use client";

import { FormEvent, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  CheckboxField,
  DateField,
  LookupField,
  MultiSelectField,
  NumberField,
  SelectField,
  TextField,
  TimeField,
} from "@/app/components/ui/form-control";
import { formatDate, formatMoney } from "@/lib/formatting-context";
import { useResolvedSettings } from "../../_components/resolved-settings-provider";

type ConfigRecord = Record<string, unknown> & {
  id: string;
  name?: string;
  code?: string;
  status?: string;
  currencyCode?: string;
  timezone?: string;
  holidays?: Array<{ id: string; name: string; holidayDate: string }>;
  days?: Array<{ id: string; dayOfWeek: string; isWorkingDay: boolean }>;
};

type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "date"
    | "time"
    | "number"
    | "checkbox"
    | "select"
    | "lookup"
    | "multiselect";
  options?: Array<string | { value: string; label: string }>;
  placeholder?: string;
  required?: boolean;
};

export function SimpleEnterpriseConfigManager({
  createFields,
  endpoint,
  records,
  title,
}: {
  createFields: Field[];
  endpoint: string;
  records: ConfigRecord[];
  title: string;
}) {
  const resolved = useResolvedSettings();
  const [items, setItems] = useState(records);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ConfigRecord | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>(() =>
    buildDraft(createFields),
  );

  const activeItems = useMemo(
    () => items.filter((item) => item.status !== "ARCHIVED"),
    [items],
  );

  async function refresh() {
    const response = await fetch(endpoint);
    if (response.ok) {
      setItems((await response.json()) as ConfigRecord[]);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    const payload = Object.fromEntries(
      createFields.map((field) => {
        const value = draft[field.name];
        return [field.name, value === "" ? null : value];
      }),
    );
    const response = await fetch(
      editingItem ? `${endpoint}/${editingItem.id}` : endpoint,
      {
        method: editingItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    setIsSaving(false);
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setMessage(error?.message ?? "Unable to save configuration.");
      return;
    }
    setEditingItem(null);
    setDraft(buildDraft(createFields));
    setMessage(editingItem ? "Changes saved." : "Created.");
    await refresh();
  }

  async function archive(id: string) {
    const response = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Unable to archive record.");
      return;
    }
    await refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Enterprise settings
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-950">
                {title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Effective context: {resolved.timezone}, {resolved.locale},{" "}
                {resolved.currency}
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <form onSubmit={save} className="grid gap-4 lg:grid-cols-4">
            {createFields.map((field) => (
              <ConfigField
                field={field}
                key={field.name}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    [field.name]: value,
                  }))
                }
                value={draft[field.name]}
              />
            ))}
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={isSaving}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                {isSaving ? "Saving" : editingItem ? "Save changes" : "Create"}
              </Button>
            </div>
            {editingItem ? (
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setDraft(buildDraft(createFields));
                  }}
                  leftIcon={<X className="h-4 w-4" />}
                  variant="secondary"
                >
                  Cancel edit
                </Button>
              </div>
            ) : null}
          </form>
          {message ? (
            <p className="mt-3 text-sm text-slate-500">{message}</p>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {activeItems.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <h2 className="text-lg font-semibold text-slate-950">
                No records yet
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Create the first configuration to make it available to the
                resolver and downstream workflows.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Code</th>
                    <th className="px-5 py-3">Region</th>
                    <th className="px-5 py-3">Details</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-4 font-medium text-slate-950">
                        {String(item.name ?? item.transactionalCurrency ?? "")}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {String(item.code ?? item.fromCurrency ?? "")}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {String(
                          item.currencyCode ??
                            item.reportingCurrency ??
                            item.countryCode ??
                            item.timezone ??
                            "",
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {renderDetails(item, resolved)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem(item);
                            setDraft(buildDraft(createFields, item));
                            setMessage(null);
                          }}
                          className="mr-2 inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => archive(item.id)}
                          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Archive
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ConfigField({
  field,
  onChange,
  value,
}: {
  field: Field;
  onChange: (value: unknown) => void;
  value: unknown;
}) {
  const options = (field.options ?? []).map((option) =>
    typeof option === "string"
      ? { value: option, label: humanize(option) }
      : option,
  );

  if (field.type === "checkbox") {
    return (
      <CheckboxField
        checked={Boolean(value)}
        label={field.label}
        onChange={onChange}
      />
    );
  }
  if (field.type === "number") {
    return (
      <NumberField
        label={field.label}
        onChange={onChange}
        required={field.required}
        value={typeof value === "number" ? value : value ? Number(value) : null}
      />
    );
  }
  if (field.type === "date") {
    return (
      <DateField
        label={field.label}
        onChange={onChange}
        required={field.required}
        value={String(value ?? "")}
      />
    );
  }
  if (field.type === "time") {
    return (
      <TimeField
        label={field.label}
        onChange={onChange}
        required={field.required}
        value={String(value ?? "")}
      />
    );
  }
  if (field.type === "lookup") {
    return (
      <LookupField
        label={field.label}
        onChange={onChange}
        options={options.map((option) => ({
          id: option.value,
          name: option.label,
        }))}
        placeholder={field.placeholder ?? `Search ${field.label}`}
        required={field.required}
        value={String(value ?? "")}
      />
    );
  }
  if (field.type === "multiselect") {
    return (
      <MultiSelectField
        label={field.label}
        onChange={onChange}
        options={options}
        required={field.required}
        value={Array.isArray(value) ? value.map(String) : []}
      />
    );
  }
  if (field.type === "select") {
    return (
      <SelectField
        label={field.label}
        onChange={onChange}
        options={options}
        placeholder={field.placeholder}
        required={field.required}
        value={String(value ?? "")}
      />
    );
  }
  return (
    <TextField
      label={field.label}
      onChange={onChange}
      placeholder={field.placeholder}
      required={field.required}
      value={String(value ?? "")}
    />
  );
}

function buildDraft(
  fields: readonly Field[],
  record?: ConfigRecord | null,
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      record?.[field.name] ??
        (field.type === "checkbox"
          ? field.name === "isActive"
          : field.type === "multiselect"
            ? []
            : ""),
    ]),
  );
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderDetails(
  item: ConfigRecord,
  resolved: { locale: string; timezone: string; currency: string },
) {
  if (item.holidays) return `${item.holidays.length} holidays`;
  if (item.days) return `${item.days.length} schedule days`;
  if (item.rate && item.fromCurrency && item.toCurrency) {
    return `${item.fromCurrency} to ${item.toCurrency}: ${item.rate}`;
  }
  if (item.budgetAmount) {
    return formatMoney(
      Number(item.budgetAmount),
      item.currencyCode as string,
      resolved,
    );
  }
  if (item.effectiveStartDate) {
    return `Effective ${formatDate(String(item.effectiveStartDate), resolved)}`;
  }
  return String(item.status ?? "ACTIVE");
}
