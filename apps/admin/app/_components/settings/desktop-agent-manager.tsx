"use client";
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount sets state after awaits; the one-shot load is intended */

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Package, RefreshCw, Users } from "lucide-react";

/**
 * The desktop agent, in one place: what has been published, and who receives it.
 *
 * These were two top-level console pages (`/app-releases`, `/agent-rollout`)
 * that rendered their own `<main>` with `dark:` variants the admin shell never
 * switches on — so they appeared as dark panels dropped into a light product,
 * with headings outside the standard page header. They are now one settings
 * screen on `SettingsShell`, like every other settings screen.
 *
 * The two tabs are a pair on purpose and always were: releases decide *what
 * exists on a channel*, rollout decides *who receives that channel*. Publishing
 * a release assigns it to nobody; assigning a tenant builds nothing. Keeping
 * them a click apart is what made that easy to get wrong.
 */

type Channel = "INTERNAL" | "BETA" | "STABLE";

type Release = {
  id: string;
  appKey: string;
  name: string;
  version: string;
  platform: string;
  architecture: string;
  channel: Channel;
  fileName: string | null;
  fileSizeBytes: number | null;
  isActive: boolean;
  publishedAt: string | null;
};

type Assignment = {
  tenantId: string;
  name: string;
  slug: string | null;
  isAssigned: boolean;
  isEnabled: boolean;
  channel: Channel;
  updatePolicy: string;
};

const NEXT_CHANNEL: Record<Channel, Channel | null> = {
  INTERNAL: "BETA",
  BETA: "STABLE",
  STABLE: null,
};

const CHANNELS: Channel[] = ["STABLE", "BETA", "INTERNAL"];

const TABS = [
  {
    key: "releases" as const,
    label: "Releases",
    icon: Package,
    description:
      "Published versions by channel. Promote to STABLE to ship to every assigned tenant's agent; disable to retire a version. Publishing does not assign a release to a tenant.",
  },
  {
    key: "rollout" as const,
    label: "Rollout",
    icon: Users,
    description:
      "Which tenants receive the desktop agent, and the channel their agents update from. A tenant on STABLE gets the latest STABLE release, BETA the latest BETA. Disabling a tenant stops new installs and auto-updates for them.",
  },
];

type TabKey = (typeof TABS)[number]["key"];

export function DesktopAgentManager() {
  const [tab, setTab] = useState<TabKey>("releases");
  const active = TABS.find((entry) => entry.key === tab)!;

  return (
    <section className="space-y-4">
      <div
        aria-label="Desktop agent sections"
        className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
        role="tablist"
      >
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const selected = entry.key === tab;
          return (
            <button
              aria-controls={`desktop-agent-${entry.key}`}
              aria-selected={selected}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                selected
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
              id={`desktop-agent-tab-${entry.key}`}
              key={entry.key}
              onClick={() => setTab(entry.key)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden className="h-4 w-4" />
              {entry.label}
            </button>
          );
        })}
      </div>

      <div
        aria-labelledby={`desktop-agent-tab-${tab}`}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        id={`desktop-agent-${tab}`}
        role="tabpanel"
      >
        <p className="mb-4 max-w-3xl text-sm leading-6 text-slate-600">
          {active.description}
        </p>
        {tab === "releases" ? <ReleasesTab /> : <RolloutTab />}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ shared */

function Denied({ what }: { what: string }) {
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {what}
    </p>
  );
}

function Loading({ what }: { what: string }) {
  return (
    <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
      <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
      Loading {what}…
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
      {children}
    </div>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <p
      className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
      role="alert"
    >
      {message}
    </p>
  );
}

const rowButton =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";

/* ---------------------------------------------------------------- releases */

function ReleasesTab() {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/app-releases/manage", { cache: "no-store" });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | { items?: Release[] }
      | Release[]
      | null;
    setReleases(Array.isArray(data) ? data : (data?.items ?? []));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (id: string, path: string, body?: unknown) => {
      setBusyId(id);
      setError(null);
      const res = await fetch(`/api/app-releases/${id}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      setBusyId(null);
      if (!res.ok) {
        setError("The action could not be completed. Try again.");
        return;
      }
      await load();
    },
    [load],
  );

  if (denied)
    return (
      <Denied what="You need the appDownloads.manage permission to manage releases." />
    );
  if (releases === null) return <Loading what="releases" />;

  const byApp = new Map<string, Release[]>();
  for (const release of releases) {
    const list = byApp.get(release.appKey) ?? [];
    list.push(release);
    byApp.set(release.appKey, list);
  }

  return (
    <div className="space-y-4">
      {error ? <Failed message={error} /> : null}
      {releases.length === 0 ? (
        <Empty>
          No releases have been published yet. Bump an app&apos;s version to
          trigger an auto-build, or publish one from the release workflow.
        </Empty>
      ) : (
        [...byApp.entries()].map(([appKey, appReleases]) => (
          <section
            className="overflow-hidden rounded-xl border border-slate-200"
            key={appKey}
          >
            <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
              {appReleases[0]?.name ?? appKey}
            </h3>
            {/* Wide content scrolls inside its own box; the page never does. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">
                  Published releases for {appReleases[0]?.name ?? appKey}
                </caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-medium" scope="col">
                      Version
                    </th>
                    <th className="px-4 py-2 font-medium" scope="col">
                      Channel
                    </th>
                    <th className="px-4 py-2 font-medium" scope="col">
                      Status
                    </th>
                    <th className="px-4 py-2 font-medium" scope="col">
                      Published
                    </th>
                    <th className="px-4 py-2 font-medium" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {appReleases.map((release) => {
                    const next = NEXT_CHANNEL[release.channel];
                    const busy = busyId === release.id;
                    return (
                      <tr className="border-t border-slate-100" key={release.id}>
                        <th
                          className="px-4 py-2 text-left font-medium text-slate-900"
                          scope="row"
                        >
                          {release.version}
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {release.platform}/{release.architecture}
                          </span>
                        </th>
                        <td className="px-4 py-2">
                          <ChannelBadge channel={release.channel} />
                        </td>
                        <td className="px-4 py-2">
                          {release.isActive ? (
                            <span className="font-medium text-emerald-700">
                              Active
                            </span>
                          ) : (
                            <span className="text-slate-500">Disabled</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {release.publishedAt
                            ? new Date(release.publishedAt).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-2">
                            {next ? (
                              <button
                                className={rowButton}
                                disabled={busy}
                                onClick={() =>
                                  act(release.id, "promote", { channel: next })
                                }
                                type="button"
                              >
                                Promote to {next}
                              </button>
                            ) : null}
                            <button
                              className={rowButton}
                              disabled={busy}
                              onClick={() =>
                                act(
                                  release.id,
                                  release.isActive ? "disable" : "enable",
                                )
                              }
                              type="button"
                            >
                              {release.isActive ? "Disable" : "Enable"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ChannelBadge({ channel }: { channel: Channel }) {
  const tone =
    channel === "STABLE"
      ? "bg-emerald-100 text-emerald-800"
      : channel === "BETA"
        ? "bg-amber-100 text-amber-900"
        : "bg-slate-200 text-slate-700";
  // The channel is spelled out, not encoded in the colour alone.
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {channel}
    </span>
  );
}

/* ----------------------------------------------------------------- rollout */

function RolloutTab() {
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
        [tenantId]: { ...prev[tenantId]!, ...patch },
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

  if (denied)
    return (
      <Denied what="You need platform administrator access to manage the desktop-agent rollout." />
    );
  if (items === null) return <Loading what="tenants" />;

  return (
    <div className="space-y-4">
      {error ? <Failed message={error} /> : null}
      {items.length === 0 ? (
        <Empty>
          No tenants exist yet. A tenant appears here once its workspace has
          been provisioned.
        </Empty>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">
                Desktop agent assignment per tenant
              </caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium" scope="col">
                    Tenant
                  </th>
                  <th className="px-4 py-2 font-medium" scope="col">
                    Enabled
                  </th>
                  <th className="px-4 py-2 font-medium" scope="col">
                    Channel
                  </th>
                  <th className="px-4 py-2 font-medium" scope="col">
                    Status
                  </th>
                  <th className="px-4 py-2 font-medium" scope="col">
                    Actions
                  </th>
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
                    <tr className="border-t border-slate-100" key={item.tenantId}>
                      <th
                        className="px-4 py-2 text-left font-medium text-slate-900"
                        scope="row"
                      >
                        {item.name}
                        {item.slug ? (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {item.slug}
                          </span>
                        ) : null}
                      </th>
                      <td className="px-4 py-2">
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            checked={draft.isEnabled}
                            className="h-4 w-4"
                            disabled={busy}
                            onChange={(event) =>
                              setDraft(item.tenantId, {
                                isEnabled: event.target.checked,
                              })
                            }
                            type="checkbox"
                          />
                          <span className="text-xs text-slate-600">
                            {draft.isEnabled ? "On" : "Off"}
                          </span>
                          <span className="sr-only">
                            Desktop agent enabled for {item.name}
                          </span>
                        </label>
                      </td>
                      <td className="px-4 py-2">
                        <label>
                          <span className="sr-only">
                            Update channel for {item.name}
                          </span>
                          <select
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
                            disabled={busy || !draft.isEnabled}
                            onChange={(event) =>
                              setDraft(item.tenantId, {
                                channel: event.target.value as Channel,
                              })
                            }
                            value={draft.channel}
                          >
                            {CHANNELS.map((channel) => (
                              <option key={channel} value={channel}>
                                {channel}
                              </option>
                            ))}
                          </select>
                        </label>
                      </td>
                      <td className="px-4 py-2">
                        {item.isAssigned ? (
                          item.isEnabled ? (
                            <span className="font-medium text-emerald-700">
                              Receiving {item.channel}
                            </span>
                          ) : (
                            <span className="text-slate-500">Disabled</span>
                          )
                        ) : (
                          <span className="text-slate-500">Not assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          className={rowButton}
                          disabled={busy || !dirty}
                          onClick={() => save(item.tenantId)}
                          type="button"
                        >
                          {busy ? (
                            <span className="inline-flex items-center gap-1.5">
                              <RefreshCw
                                aria-hidden
                                className="h-3 w-3 animate-spin"
                              />
                              Saving…
                            </span>
                          ) : (
                            "Save"
                          )}
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
    </div>
  );
}
