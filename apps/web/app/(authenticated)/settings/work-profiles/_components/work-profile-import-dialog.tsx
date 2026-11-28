"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  workProfilesRequest,
  type ImportItem,
} from "../_lib/work-profiles-client";

const ACTION_LABEL: Record<ImportItem["action"], string> = {
  create: "Create",
  "new-version": "New version",
  unchanged: "No change",
};

const ACTION_TONE: Record<ImportItem["action"], "good" | "info" | "muted"> = {
  create: "good",
  "new-version": "info",
  unchanged: "muted",
};

/**
 * Imports a `.djpkg` holding work profiles. The file is checked first (a dry
 * run writes nothing) and the result is shown before anything is applied.
 */
export function WorkProfileImportDialog({
  onChanged,
  onClose,
  open,
}: {
  onChanged: () => Promise<void>;
  onClose: () => void;
  open: boolean;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<ImportItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setContent(null);
    setFileName("");
    setItems(null);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const check = async (text: string) => {
    setBusy(true);
    setError(null);
    setItems(null);
    try {
      const result = await workProfilesRequest<{ items: ImportItem[] }>(
        "/import",
        { method: "POST", body: { content: text, dryRun: true } },
      );
      setItems(result.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The file could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const choose = async (file: File | undefined) => {
    reset();
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setContent(text);
    await check(text);
  };

  const apply = async () => {
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      await workProfilesRequest("/import", {
        method: "POST",
        body: { content },
      });
      await onChanged();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import failed.");
    } finally {
      setBusy(false);
    }
  };

  const nothingToDo = items?.every((item) => item.action === "unchanged");

  return (
    <Dialog
      busy={busy}
      footer={
        <>
          <Button onClick={close} variant="secondary">
            Cancel
          </Button>
          <Button
            disabled={!items || nothingToDo}
            loading={busy}
            onClick={() => void apply()}
          >
            Import
          </Button>
        </>
      }
      onClose={close}
      open={open}
      size="lg"
      title="Import work profiles"
    >
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium text-foreground">
          Package file (.djpkg)
          <input
            accept=".djpkg,application/json"
            className="block w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm"
            onChange={(event) => void choose(event.target.files?.[0])}
            type="file"
          />
        </label>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {busy && !items ? (
          <div
            aria-busy="true"
            className="h-16 animate-pulse rounded-[22px] bg-surface-strong"
          />
        ) : null}
        {items ? (
          <ul aria-label={`Contents of ${fileName}`} className="grid gap-2">
            {items.map((item) => (
              <li
                className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3 text-sm"
                key={item.key}
              >
                <span className="min-w-0 truncate text-foreground">
                  {item.key.replace(":", " ")}
                </span>
                <StatusPill tone={ACTION_TONE[item.action]}>
                  {ACTION_LABEL[item.action]}
                </StatusPill>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Dialog>
  );
}
