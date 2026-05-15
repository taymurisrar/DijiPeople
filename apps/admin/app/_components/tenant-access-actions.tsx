"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

type TenantAccessActionsProps = {
  primaryDomain?: string | null;
  loginUrl: string;
  slug?: string | null;
  status?: string | null;
  tenantCode?: string | null;
  tenantName?: string | null;
};

export function TenantAccessActions({
  primaryDomain,
  loginUrl,
  slug,
  status,
  tenantCode,
  tenantName,
}: TenantAccessActionsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const hasSlug = Boolean(slug?.trim());

  async function copyUrl() {
    if (!hasSlug) return;

    try {
      await navigator.clipboard.writeText(loginUrl);
      setMessage("Tenant login URL copied.");
    } catch {
      setMessage("Unable to copy tenant login URL.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <AccessField label="Tenant name" value={tenantName ?? "Not available"} />
        <AccessField label="Tenant code" value={tenantCode ?? "Not generated"} />
        <AccessField label="Tenant slug" value={slug ?? "Not configured"} />
        <AccessField label="Tenant status" value={status ?? "Not available"} />
        <AccessField
          label="Primary domain"
          value={primaryDomain ?? "System subdomain"}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          Tenant login URL
        </p>
        <p className="mt-2 break-all font-medium text-slate-950">
          {hasSlug
            ? loginUrl
            : "Tenant slug is required before a login URL can be generated."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          aria-disabled={!hasSlug}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 aria-disabled:pointer-events-none aria-disabled:opacity-50"
          href={hasSlug ? loginUrl : undefined}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="h-4 w-4" />
          Open URL
        </a>

        <button
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasSlug}
          onClick={copyUrl}
          type="button"
        >
          <Copy className="h-4 w-4" />
          Copy URL
        </button>
      </div>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}

function AccessField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <span className="text-right font-medium text-slate-950">{value}</span>
    </div>
  );
}
