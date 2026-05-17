"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TenantStatusValue } from "@/lib/domain";
import { validateTenantSlug } from "@/lib/tenant-slug";

const TENANT_STATUS_OPTIONS: TenantStatusValue[] = [
  "PENDING_SETUP",
  "ONBOARDING",
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "ARCHIVED",
  "CHURNED",
];

type TenantDetailEditFormProps = {
  canEditSlug: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: TenantStatusValue | string;
    customerAccount: { legalCompanyName?: string | null } | null;
  };
};

export function TenantDetailEditForm({
  canEditSlug,
  tenant,
}: TenantDetailEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: tenant.name,
    legalName: tenant.customerAccount?.legalCompanyName ?? "",
    slug: tenant.slug,
    status: tenant.status,
  });

  function updateForm(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedSlug = form.slug.trim().toLowerCase();
    const slugChanged = normalizedSlug !== tenant.slug;
    const validationError =
      canEditSlug && slugChanged ? validateTenantSlug(normalizedSlug) : null;

    if (validationError) {
      setMessage(validationError);
      return;
    }

    startTransition(async () => {
      const profileResponse = await fetch(`/api/super-admin/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          legalName: form.legalName.trim() || null,
          status: form.status,
        }),
      });
      const profilePayload = (await profileResponse.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!profileResponse.ok) {
        setMessage(profilePayload?.message ?? "Unable to update tenant.");
        return;
      }

      if (canEditSlug && slugChanged) {
        const slugResponse = await fetch(
          `/api/super-admin/tenants/${tenant.id}/slug`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug: normalizedSlug }),
          },
        );
        const slugPayload = (await slugResponse.json().catch(() => null)) as
          | { message?: string }
          | null;

        if (!slugResponse.ok) {
          setMessage(slugPayload?.message ?? "Unable to update tenant slug.");
          return;
        }
      }

      setMessage("Tenant details updated.");
      router.refresh();
    });
  }

  return (
    <form
      className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      onSubmit={handleSubmit}
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Edit tenant</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Tenant ID and generated tenant code are immutable. Changes to the slug update web login URLs immediately.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="Tenant name"
          onChange={(value) => updateForm("name", value)}
          value={form.name}
        />
        <TextField
          label="Legal name"
          onChange={(value) => updateForm("legalName", value)}
          value={form.legalName}
        />
        <TextField
          help="Lowercase letters, numbers, and single hyphens only."
          label="Tenant slug"
          readOnly={!canEditSlug}
          onChange={(value) => updateForm("slug", value.toLowerCase())}
          value={form.slug}
        />
        <label className="block text-sm font-medium text-slate-700">
          Status
          <select
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            onChange={(event) => updateForm("status", event.target.value)}
            value={form.status}
          >
            {(TENANT_STATUS_OPTIONS.includes(form.status as TenantStatusValue)
              ? TENANT_STATUS_OPTIONS
              : [form.status, ...TENANT_STATUS_OPTIONS]
            ).map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      <button
        className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Saving..." : "Save tenant"}
      </button>
      <button
        className="ml-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
        onClick={() => router.push(`/tenants/${tenant.id}?tab=settings`)}
        type="button"
      >
        Cancel
      </button>
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  help,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900"
        disabled={readOnly}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        value={value}
      />
      {help || readOnly ? (
        <span className="mt-1 block text-xs text-slate-500">
          {readOnly
            ? "Only System Customizer can update tenant slug."
            : help}
        </span>
      ) : null}
    </label>
  );
}
