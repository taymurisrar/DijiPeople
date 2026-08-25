"use client";
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount sets state after awaits; the one-shot loading cascade is intended */

import { useCallback, useEffect, useState } from "react";

/**
 * Tenant configuration of DLP rules (TASK-0023). A rule fires when content is
 * copied from a source app and a channel app then comes forward — the trigger
 * for a screenshot. Without at least one rule, screenshot capture never fires,
 * so this editor (and the recommended starter set) is what makes the screenshot
 * half of DLP usable. Talks to `/api/agent/dlp/rules`; the API enforces
 * `agent.settings.manage`.
 */

type DlpRule = {
  id: string;
  name: string;
  enabled: boolean;
  sourceAppPatterns: string[];
  channelAppPatterns: string[];
  action: "OBSERVE" | "ALERT" | "BLOCK";
};

type DraftRule = {
  id?: string;
  name: string;
  enabled: boolean;
  sourceAppPatterns: string;
  channelAppPatterns: string;
};

const EMPTY_DRAFT: DraftRule = {
  name: "",
  enabled: true,
  sourceAppPatterns: "",
  channelAppPatterns: "",
};

/**
 * A sensible starting point so a tenant is not staring at a blank rule list:
 * common places sensitive data is opened, and the channels it tends to leak to.
 * Tenants edit or remove these freely.
 */
const RECOMMENDED_RULES: Array<Omit<DlpRule, "id">> = [
  {
    name: "Office documents to messaging apps",
    enabled: true,
    sourceAppPatterns: ["excel", "word", "powerpoint", "acrobat", "pdf"],
    channelAppPatterns: ["whatsapp", "telegram", "signal", "messenger"],
    action: "OBSERVE",
  },
  {
    name: "HR/payroll to personal webmail",
    enabled: true,
    sourceAppPatterns: ["excel", "payroll", "hr", "dijipeople"],
    channelAppPatterns: ["gmail", "yahoo", "outlook.live", "proton", "webmail"],
    action: "OBSERVE",
  },
  {
    name: "Anything to removable/cloud drives",
    enabled: true,
    sourceAppPatterns: ["excel", "word", "acrobat", "pdf"],
    channelAppPatterns: [
      "dropbox",
      "drive.google",
      "onedrive",
      "usb",
      "removable",
    ],
    action: "OBSERVE",
  },
];

export function DlpRulesManager() {
  const [rules, setRules] = useState<DlpRule[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [draft, setDraft] = useState<DraftRule>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/agent/dlp/rules", { cache: "no-store" });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | DlpRule[]
      | { items?: DlpRule[] }
      | null;
    setRules(Array.isArray(data) ? data : (data?.items ?? []));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (body: unknown) => {
      setBusy(true);
      setError(null);
      const res = await fetch("/api/agent/dlp/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setBusy(false);
      if (!res.ok) {
        setError("Could not save the rule. Check the patterns and try again.");
        return false;
      }
      await load();
      return true;
    },
    [load],
  );

  const submitDraft = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const source = splitPatterns(draft.sourceAppPatterns);
      const channel = splitPatterns(draft.channelAppPatterns);
      if (!draft.name.trim() || source.length === 0 || channel.length === 0) {
        setError(
          "A rule needs a name, at least one source pattern, and at least one channel pattern.",
        );
        return;
      }
      const ok = await save({
        id: draft.id,
        name: draft.name.trim(),
        enabled: draft.enabled,
        sourceAppPatterns: source,
        channelAppPatterns: channel,
        action: "OBSERVE",
      });
      if (ok) setDraft(EMPTY_DRAFT);
    },
    [draft, save],
  );

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      await fetch(`/api/agent/dlp/rules/${id}`, { method: "DELETE" });
      setBusy(false);
      await load();
    },
    [load],
  );

  const addRecommended = useCallback(async () => {
    for (const rule of RECOMMENDED_RULES) {
      await save(rule);
    }
  }, [save]);

  if (denied) return null;

  return (
    <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">DLP rules</h3>
          <p className="mt-1 text-sm text-muted">
            A rule fires when content copied from a <strong>source</strong> app
            is pasted while a <strong>channel</strong> app is in front,
            triggering a screenshot. Patterns match the app name or path
            (case-insensitive substring), e.g. <code>excel</code>,{" "}
            <code>whatsapp</code>.
          </p>
        </div>
        {rules && rules.length === 0 ? (
          <button
            type="button"
            onClick={addRecommended}
            disabled={busy}
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
          >
            Add recommended rules
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {rules && rules.length > 0 ? (
        <ul className="grid gap-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {rule.name}{" "}
                  {!rule.enabled ? (
                    <span className="text-xs text-muted">(disabled)</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted">
                  {rule.sourceAppPatterns.join(", ")} →{" "}
                  {rule.channelAppPatterns.join(", ")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      id: rule.id,
                      name: rule.name,
                      enabled: rule.enabled,
                      sourceAppPatterns: rule.sourceAppPatterns.join(", "),
                      channelAppPatterns: rule.channelAppPatterns.join(", "),
                    })
                  }
                  className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground transition hover:bg-surface-strong"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(rule.id)}
                  disabled={busy}
                  className="rounded-xl border border-border px-3 py-1.5 text-sm text-danger transition hover:bg-surface-strong disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No rules yet. Screenshots will not fire until at least one rule
          exists.
        </p>
      )}

      <form
        onSubmit={submitDraft}
        className="grid gap-3 rounded-2xl border border-border bg-surface-strong p-4"
      >
        <p className="text-sm font-medium text-foreground">
          {draft.id ? "Edit rule" : "Add a rule"}
        </p>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Name</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="rounded-xl border border-border bg-white/70 px-3 py-2"
            placeholder="e.g. Payroll to WhatsApp"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">
            Source app patterns (comma-separated)
          </span>
          <input
            value={draft.sourceAppPatterns}
            onChange={(e) =>
              setDraft({ ...draft, sourceAppPatterns: e.target.value })
            }
            className="rounded-xl border border-border bg-white/70 px-3 py-2"
            placeholder="excel, payroll, acrobat"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">
            Channel app patterns (comma-separated)
          </span>
          <input
            value={draft.channelAppPatterns}
            onChange={(e) =>
              setDraft({ ...draft, channelAppPatterns: e.target.value })
            }
            className="rounded-xl border border-border bg-white/70 px-3 py-2"
            placeholder="whatsapp, telegram, gmail"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          <span className="text-foreground">Enabled</span>
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
          >
            {draft.id ? "Save changes" : "Add rule"}
          </button>
          {draft.id ? (
            <button
              type="button"
              onClick={() => setDraft(EMPTY_DRAFT)}
              className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function splitPatterns(value: string): string[] {
  return value
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
