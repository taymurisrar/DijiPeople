"use client";

import { Copy, X } from "lucide-react";
import { useState } from "react";

export function ModuleShareDialog({
  link,
  onClose,
  open,
  title = "Share record",
}: {
  readonly link: string;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly title?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-[28px] border border-border bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              This link only works for users who already have the relevant
              module permissions.
            </p>
          </div>
          <button
            aria-label="Close share dialog"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-muted/20 hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm text-foreground outline-none"
            readOnly
            value={link}
          />
          <button
            className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            onClick={copyLink}
            type="button"
          >
            <Copy className="h-4 w-4" />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
