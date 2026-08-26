"use client";
/* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount sets state after awaits; the one-shot load is intended */

import { useCallback, useEffect, useState } from "react";

/**
 * App releases management (TASK-0026): the platform-admin view of every
 * published release — versions, channels, active status — with enable/disable
 * and channel promotion. The API enforces `appDownloads.manage` and audits every
 * change; this screen only renders and forwards.
 *
 * Promoting to STABLE is the deliberate "ship to the fleet" step: STABLE is the
 * channel every assigned tenant's agent auto-updates from. Publishing/promotion
 * never assigns a release to a tenant — TenantAppAssignment decides eligibility.
 */

type Release = {
  id: string;
  appKey: string;
  name: string;
  version: string;
  platform: string;
  architecture: string;
  channel: "INTERNAL" | "BETA" | "STABLE";
  fileName: string | null;
  fileSizeBytes: number | null;
  isActive: boolean;
  publishedAt: string | null;
};

const NEXT_CHANNEL: Record<Release["channel"], Release["channel"] | null> = {
  INTERNAL: "BETA",
  BETA: "STABLE",
  STABLE: null,
};

export default function AppReleasesPage() {
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

  if (denied) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">App releases</h1>
        <p className="mt-2 text-sm text-slate-500">
          You need the <code>appDownloads.manage</code> permission to manage
          releases.
        </p>
      </main>
    );
  }

  const byApp = new Map<string, Release[]>();
  for (const release of releases ?? []) {
    const list = byApp.get(release.appKey) ?? [];
    list.push(release);
    byApp.set(release.appKey, list);
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-6 p-6 md:p-8">
      <header>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          App releases
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Published versions by channel. Promote to STABLE to ship to every
          assigned tenant&apos;s agent; disable to retire a version. Publishing
          does not assign a release to a tenant.
        </p>
      </header>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {releases === null ? (
        <p className="text-sm text-slate-500">Loading releases…</p>
      ) : releases.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          No releases have been published yet. Bump an app&apos;s version to
          trigger an auto-build, or publish one from the release workflow.
        </p>
      ) : (
        [...byApp.entries()].map(([appKey, appReleases]) => (
          <section
            key={appKey}
            className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
          >
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {appReleases[0]?.name ?? appKey}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-medium">Version</th>
                    <th className="px-4 py-2 font-medium">Channel</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Published</th>
                    <th className="px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appReleases.map((release) => {
                    const next = NEXT_CHANNEL[release.channel];
                    const busy = busyId === release.id;
                    return (
                      <tr
                        key={release.id}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">
                          {release.version}
                          <span className="ml-2 text-xs text-slate-400">
                            {release.platform}/{release.architecture}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <ChannelBadge channel={release.channel} />
                        </td>
                        <td className="px-4 py-2">
                          {release.isActive ? (
                            <span className="text-emerald-600">Active</span>
                          ) : (
                            <span className="text-slate-400">Disabled</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-500">
                          {release.publishedAt
                            ? new Date(release.publishedAt).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-2">
                            {next ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  act(release.id, "promote", { channel: next })
                                }
                                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
                              >
                                Promote to {next}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                act(
                                  release.id,
                                  release.isActive ? "disable" : "enable",
                                )
                              }
                              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
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
    </main>
  );
}

function ChannelBadge({ channel }: { channel: Release["channel"] }) {
  const tone =
    channel === "STABLE"
      ? "bg-emerald-100 text-emerald-800"
      : channel === "BETA"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-200 text-slate-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {channel}
    </span>
  );
}
