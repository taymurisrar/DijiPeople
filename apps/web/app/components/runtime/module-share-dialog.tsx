"use client";

import { Copy } from "lucide-react";
import { useId, useState } from "react";
import { Dialog, DialogCloseButton } from "@/app/components/ui/dialog";

/**
 * Escape did nothing here and `aria-labelledby` named nothing; the read-only
 * link input carried no accessible name at all. All three come from the shared
 * primitive and an explicit label now. BUG-0043.
 */
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
  const linkId = useId();

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Dialog
      description="This link only works for users who already have the relevant module permissions."
      footer={<DialogCloseButton onClick={onClose} />}
      onClose={onClose}
      open={open}
      size="md"
      title={title}
    >
      <label className="sr-only" htmlFor={linkId}>
        Record link
      </label>
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm text-foreground outline-none"
          id={linkId}
          readOnly
          value={link}
        />
        <button
          className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
          onClick={copyLink}
          type="button"
        >
          <Copy aria-hidden="true" className="h-4 w-4" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Announce the copy without moving focus. */}
      <p aria-live="polite" className="sr-only">
        {copied ? "Link copied to clipboard" : ""}
      </p>
    </Dialog>
  );
}
