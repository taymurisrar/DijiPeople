"use client";
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount sets state after awaits; the one-shot load is intended */

import { useCallback, useEffect, useState } from "react";

/**
 * Desktop-agent rollout (TASK-0027): which tenants receive the agent, and on
 * which release channel their agents auto-update. This is the "who gets it"
 * control; App releases is the "what exists on a channel" control. A tenant on
 * STABLE receives the latest STABLE release, one on BETA the latest BETA, and a
 * disabled tenant none — assigning a tenant never builds or promotes anything.
 *
 * The API enforces the platform guard and audits every change; this screen only
 * renders and forwards.
 */

type Channel = "INTERNAL" | "BETA" | "STABLE";

type Assignment = {
  tenantId: string;
  name: string;
  slug: string | null;
  isAssigned: boolean;
  isEnabled: boolean;
  channel: Channel;
  updatePolicy: string;
};

const CHANNELS: Channel[] = ["STABLE", "BETA", "INTERNAL"];

export default function AgentRolloutPage() {
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Row-local edits, keyed by tenantId, applied only when Save is pressed.
  const [drafts, setDrafts] = useState<
    Record<string, { isEnabled: boolean; channel: Channel }>
  >({});

  const load = useCallback(async () => {
    const res = await fetch("/api/super-admin/agent-assignments", {
      cache: "no-store",
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | { items?: Assignment[] }
      | Assignment[]
      | null;
    const list = Array.isArray(data) ? data : (data?.items ?? []);
    setItems(list);
    setDrafts(
      Object.fromEntries(
        list.map((item) => [
          item.tenantId,
          { isEnabled: item.isEnabled, channel: item.channel },
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setDraft = useCallback(
    (
      tenantId: string,
      patch: Partial<{ isEnabled: boolean; channel: Channel }>,
    ) => {
      setDrafts((prev) => ({
        ...prev,
        [tenantId]: { ...prev[tenantId], ...patch },
      }));
    },
    [],
  );

  const save = useCallback(
    async (tenantId: string) => {
      const draft = drafts[tenantId];
      if (!draft) return;
      setBusyId(tenantId);
      setError(null);
      const res = await fetch(
        `/api/super-admin/tenants/${tenantId}/agent-assignment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      setBusyId(null);
      if (!res.ok) {
        setError("The change could not be saved. Try again.");
        return;
      }
      await load();
    },
    [drafts, load],
  );

  if (denied) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Agent rollout</h1>
        <p className="mt-2 text-sm text-slate-500">
          You need platform administrator access to manage the desktop-agent
          rollout.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-6 p-6 md:p-8">
      <header>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Agent rollout
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose which tenants receive the desktop agent and the channel their
          agents update from. A tenant on STABLE gets the latest STABLE release,
          BETA the latest BETA. Disabling a tenant stops new installs and
          auto-updates for them. Publishing a release lives under App releases.
        </p>
      </header>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {items === null ? (
        <p className="text-sm text-slate-500">Loading tenants…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          No tenants found.
        </p>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Tenant</th>
                  <th className="px-4 py-2 font-medium">Enabled</th>
                  <th className="px-4 py-2 font-medium">Channel</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const draft = drafts[item.tenantId] ?? {
                    isEnabled: item.isEnabled,
                    channel: item.channel,
                  };
                  const dirty =
                    draft.isEnabled !== item.isEnabled ||
                    draft.channel !== item.channel;
                  const busy = busyId === item.tenantId;
                  return (
                    <tr
                      key={item.tenantId}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">
                        {item.name}
                        {item.slug ? (
                          <span className="ml-2 text-xs text-slate-400">
                            {item.slug}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draft.isEnabled}
                            disabled={busy}
                            onChange={(e) =>
                              setDraft(item.tenantId, {
                                isEnabled: e.target.checked,
                              })
                            }
                            className="h-4 w-4"
                          />
                          <span className="text-xs text-slate-600 dark:text-slate-300">
                            {draft.isEnabled ? "On" : "Off"}
                          </span>
                        </label>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={draft.channel}
                          disabled={busy || !draft.isEnabled}
                          onChange={(e) =>
                            setDraft(item.tenantId, {
                              channel: e.target.value as Channel,
                            })
                          }
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        >
                          {CHANNELS.map((channel) => (
                            <option key={channel} value={channel}>
                              {channel}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        {item.isAssigned ? (
                          item.isEnabled ? (
                            <span className="text-emerald-600">
                              Receiving {item.channel}
                            </span>
                          ) : (
                            <span className="text-slate-400">Disabled</span>
                          )
                        ) : (
                          <span className="text-slate-400">Not assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          disabled={busy || !dirty}
                          onClick={() => save(item.tenantId)}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
                        >
                          {busy ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
