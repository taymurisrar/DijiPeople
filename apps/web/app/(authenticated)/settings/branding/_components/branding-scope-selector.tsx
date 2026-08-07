"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type BrandingOrganization = {
  id: string;
  name: string;
  code?: string | null;
};

/**
 * Chooses whether the branding form edits the tenant defaults or one
 * organization's overrides. Only rendered when the tenant actually runs more
 * than one organization, so single-organization tenants see no extra control.
 */
export function BrandingScopeSelector({
  activeOrganizationId,
  organizations,
}: {
  readonly activeOrganizationId: string;
  readonly organizations: readonly BrandingOrganization[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function selectScope(organizationId: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (organizationId) {
      params.set("organizationId", organizationId);
    } else {
      params.delete("organizationId");
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `?${query}` : "?", { scroll: false });
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2 rounded-2xl border border-border bg-surface p-4">
      <label
        className="text-sm font-medium text-foreground"
        htmlFor="branding-scope"
      >
        Branding scope
      </label>

      <select
        className="w-full max-w-md rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-slate-50"
        disabled={isPending}
        id="branding-scope"
        onChange={(event) => selectScope(event.target.value)}
        value={activeOrganizationId}
      >
        <option value="">Tenant default (applies to all organizations)</option>
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>

      <p className="text-xs text-muted">
        {activeOrganizationId
          ? "Saving here creates overrides for this organization only. Clear a field to inherit the tenant value again."
          : "Saving here updates the tenant defaults that every organization inherits."}
      </p>
    </div>
  );
}
