"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

type TenantAccessActionsProps = {
  loginUrl: string;
  slug?: string | null;
};

export function TenantAccessActions({
  loginUrl,
  slug,
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
