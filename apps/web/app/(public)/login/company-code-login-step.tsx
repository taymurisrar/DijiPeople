"use client";

import { FormEvent, useState } from "react";
import { buildTenantLoginUrl } from "@/lib/tenant-url";

type ResolveResponse = {
  tenant: {
    slug: string;
    tenantCode?: string | null;
    displayName: string;
    status: string;
  };
};

export function CompanyCodeLoginStep() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tenantValue = value.trim();
    if (!tenantValue) {
      setError("Enter your company code or tenant slug.");
      return;
    }

    setIsResolving(true);
    setError(null);

    const query = /^TEN-\d{6,}$/i.test(tenantValue)
      ? `tenantCode=${encodeURIComponent(tenantValue.toUpperCase())}`
      : `slug=${encodeURIComponent(tenantValue.toLowerCase())}`;

    try {
      const response = await fetch(`/api/public/tenants/resolve?${query}`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | ResolveResponse
        | { message?: string }
        | null;

      if (!response.ok || !data || !("tenant" in data)) {
        setError(
          "We could not find that company. Check the code and try again.",
        );
        return;
      }

      window.location.assign(buildTenantLoginUrl(data.tenant.slug));
    } catch {
      setError("Unable to resolve company code right now.");
    } finally {
      setIsResolving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <label className="block space-y-2 text-sm">
        <span className="font-medium text-foreground">Company code or slug</span>
        <input
          autoCapitalize="none"
          autoComplete="organization"
          className="block w-full min-w-0 rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) => setValue(event.target.value)}
          placeholder="TEN-000001 or acme-cpa"
          spellCheck={false}
          value={value}
        />
      </label>

      <button
        className="w-full rounded-2xl bg-accent px-4 py-3 font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isResolving}
        type="submit"
      >
        {isResolving ? "Finding company..." : "Continue"}
      </button>
    </form>
  );
}
