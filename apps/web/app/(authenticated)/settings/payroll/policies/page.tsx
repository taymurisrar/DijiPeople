import Link from "next/link";
import { Search } from "lucide-react";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";

type PolicyCategory = {
  name: string;
  activeCount: number;
  draftCount: number;
  expiredCount: number;
  incompleteCount: number;
  lastModified: string | null;
  owner: string | null;
};

type PolicyItem = {
  id: string;
  name: string;
  code: string;
  policyType: string;
  organization: string | null;
  scope: string;
  countryCode: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: string;
  isDefault: boolean;
  owner: string | null;
  incomplete: boolean;
  href: string;
};

type PolicyRegister = {
  categories: PolicyCategory[];
  items: PolicyItem[];
  meta: { total: number };
};

type LookupRecord = {
  id?: string;
  name?: string;
  code?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

const filterKeys = [
  "search",
  "policyType",
  "status",
  "organizationId",
  "countryCode",
  "ownerUserId",
  "effectiveDate",
  "isDefault",
] as const;

export default async function PayrollPoliciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSettingsPermissions(["payroll.settings.read"]);
  const incoming = await searchParams;
  const query = new URLSearchParams();
  for (const key of filterKeys) {
    const value = incoming[key];
    if (typeof value === "string" && value) query.set(key, value);
  }
  const [register, organizationPayload, userPayload, countryPayload] =
    await Promise.all([
      apiRequestJson<PolicyRegister>(`/payroll/policies?${query.toString()}`),
      apiRequestJson<unknown>("/organizations?isActive=true"),
      apiRequestJson<unknown>("/users?pageSize=200"),
      apiRequestJson<unknown>("/lookups/countries"),
    ]);
  const organizations = records(organizationPayload);
  const users = records(userPayload);
  const countries = records(countryPayload);

  return (
    <SettingsShell
      eyebrow="Payroll governance"
      title="Payroll Policies"
      description="Search and govern compensation, tax, time, benefit, loan and statutory policies without merging their domain models."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {register.categories.map((category) => (
          <Link
            key={category.name}
            href={`/settings/payroll/policies?policyType=${encodeURIComponent(category.name)}`}
            className="rounded-[18px] border border-border bg-surface p-4 shadow-sm transition hover:border-accent/30"
          >
            <h2 className="text-sm font-semibold text-foreground">
              {category.name}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Metric
                label="Active"
                value={category.activeCount}
                tone="ready"
              />
              <Metric label="Draft" value={category.draftCount} />
              <Metric label="Expired" value={category.expiredCount} />
              <Metric
                label="Incomplete"
                value={category.incompleteCount}
                tone={category.incompleteCount ? "warning" : undefined}
              />
            </div>
            <p className="mt-3 truncate text-xs text-muted">
              {category.owner ?? "No owner"} ·{" "}
              {category.lastModified
                ? formatDate(category.lastModified)
                : "No records"}
            </p>
          </Link>
        ))}
      </div>

      <form className="grid gap-3 rounded-[20px] border border-border bg-surface p-4 shadow-sm md:grid-cols-3 xl:grid-cols-5">
        <label className="relative md:col-span-2">
          <span className="sr-only">Search policies</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
          <input
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm"
            defaultValue={single(incoming.search)}
            name="search"
            placeholder="Search name, code, type, owner"
          />
        </label>
        <FilterSelect
          label="Policy Type"
          name="policyType"
          value={single(incoming.policyType)}
          options={register.categories.map((item) => [item.name, item.name])}
        />
        <FilterSelect
          label="Status"
          name="status"
          value={single(incoming.status)}
          options={["DRAFT", "ACTIVE", "INACTIVE", "EXPIRED", "ARCHIVED"].map(
            (item) => [item, titleCase(item)],
          )}
        />
        <FilterSelect
          label="Organization"
          name="organizationId"
          value={single(incoming.organizationId)}
          options={organizations.flatMap((item) =>
            item.id && item.name
              ? [[item.id, item.name] as [string, string]]
              : [],
          )}
        />
        <FilterSelect
          label="Country / Region"
          name="countryCode"
          value={single(incoming.countryCode)}
          options={countries.flatMap((item) =>
            item.code && item.name
              ? [[item.code, item.name] as [string, string]]
              : [],
          )}
        />
        <FilterSelect
          label="Owner"
          name="ownerUserId"
          value={single(incoming.ownerUserId)}
          options={users.flatMap((item) =>
            item.id
              ? [
                  [
                    item.id,
                    `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim() ||
                      item.email ||
                      "User",
                  ] as [string, string],
                ]
              : [],
          )}
        />
        <label className="grid gap-1 text-xs font-medium text-muted">
          Effective Date
          <input
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
            defaultValue={single(incoming.effectiveDate)}
            name="effectiveDate"
            type="date"
          />
        </label>
        <FilterSelect
          label="Default"
          name="isDefault"
          value={single(incoming.isDefault)}
          options={[
            ["true", "Default only"],
            ["false", "Non-default"],
          ]}
        />
        <div className="flex items-end gap-2">
          <button
            className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white"
            type="submit"
          >
            Apply filters
          </button>
          <Link
            className="flex h-10 items-center rounded-xl border border-border px-3 text-sm font-semibold text-muted"
            href="/settings/payroll/policies"
          >
            Clear
          </Link>
        </div>
      </form>

      <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold text-foreground">
            Unified policy register
          </h2>
          <span className="text-xs text-muted">
            {register.meta.total} records
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                {[
                  "Name",
                  "Code",
                  "Policy Type",
                  "Organization",
                  "Scope",
                  "Effective From",
                  "Effective To",
                  "Status",
                  "Default",
                  "Owner",
                ].map((label) => (
                  <th className="px-4 py-3 font-semibold" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {register.items.map((item) => (
                <tr
                  key={`${item.policyType}-${item.id}`}
                  className="hover:bg-background/70"
                >
                  <td className="px-4 py-3">
                    <Link
                      className="font-semibold text-foreground hover:text-accent"
                      href={item.href}
                    >
                      {item.name}
                    </Link>
                    {item.incomplete ? (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        Incomplete
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{item.code}</td>
                  <td className="px-4 py-3">{item.policyType}</td>
                  <td className="px-4 py-3">{item.organization ?? "Tenant"}</td>
                  <td className="px-4 py-3">{item.scope}</td>
                  <td className="px-4 py-3">
                    {formatDate(item.effectiveFrom)}
                  </td>
                  <td className="px-4 py-3">{formatDate(item.effectiveTo)}</td>
                  <td className="px-4 py-3">
                    <Status status={item.status} />
                  </td>
                  <td className="px-4 py-3">{item.isDefault ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">{item.owner ?? "—"}</td>
                </tr>
              ))}
              {!register.items.length ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-muted"
                    colSpan={10}
                  >
                    No policies match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </SettingsShell>
  );
}

function records(payload: unknown): LookupRecord[] {
  if (Array.isArray(payload)) return payload as LookupRecord[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { items?: unknown[] }).items)
  )
    return (payload as { items: LookupRecord[] }).items;
  return [];
}

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}
function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "—";
}
function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ready" | "warning";
}) {
  return (
    <span
      className={`rounded-lg px-2 py-1.5 ${tone === "ready" ? "bg-emerald-50 text-emerald-700" : tone === "warning" ? "bg-amber-50 text-amber-800" : "bg-background text-muted"}`}
    >
      <strong className="mr-1 text-foreground">{value}</strong>
      {label}
    </span>
  );
}
function Status({ status }: { status: string }) {
  const ready = status === "ACTIVE";
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : status === "DRAFT" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-700"}`}
    >
      {titleCase(status)}
    </span>
  );
}
function FilterSelect({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: Array<readonly [string, string]>;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted">
      {label}
      <select
        className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
        defaultValue={value}
        name={name}
      >
        <option value="">All</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
