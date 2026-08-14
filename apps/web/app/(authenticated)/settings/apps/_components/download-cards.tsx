"use client";

import { useState } from "react";

import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  appDescription,
  appName,
  formatDateTime,
  formatFileSize,
  isRecommendedBuild,
  platformLabel,
} from "../../integrations/attendance/_lib/presentation";
import type { ApplicationRelease } from "../../integrations/attendance/_lib/types";

/**
 * Downloadable applications.
 *
 * Releases are grouped by app so an administrator picks the product first and
 * the build second. The recommended build is highlighted, but every build the
 * API returned stays selectable — someone deliberately fetching the 32-bit
 * utility should not have to fight the UI.
 *
 * Only what the API returned is shown. Channel visibility and per-release
 * permissions are applied server-side, so an INTERNAL release simply never
 * reaches this component.
 */
export function DownloadCards({
  releases,
}: {
  releases: ApplicationRelease[];
}) {
  const [openNotes, setOpenNotes] = useState<string | null>(null);

  if (releases.length === 0) {
    return (
      <EmptyState
        title="No applications available to download"
        description="DijiPeople applications appear here once they have been published for your organisation."
      />
    );
  }

  const byApp = releases.reduce<Record<string, ApplicationRelease[]>>(
    (groups, release) => {
      groups[release.appKey] = [...(groups[release.appKey] ?? []), release];
      return groups;
    },
    {},
  );

  return (
    <div className="grid gap-4">
      {Object.entries(byApp).map(([appKey, appReleases]) => {
        // Newest first, so the default choice is the current version.
        const sorted = [...appReleases].sort((left, right) =>
          (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""),
        );
        const primary = sorted[0];

        return (
          <article
            key={appKey}
            className="rounded-[24px] border border-border bg-surface p-6 shadow-sm"
            data-testid={`download-card-${appKey}`}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <h3 className="text-lg font-semibold text-foreground">
                  {appName(appKey, primary.name)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {appDescription(appKey, primary.description)}
                </p>
              </div>
              <div className="grid gap-1 text-sm md:text-right">
                <span className="font-medium text-foreground">
                  Version {primary.version}
                </span>
                <span className="text-muted">
                  Published {formatDateTime(primary.publishedAt)}
                </span>
              </div>
            </div>

            <ul className="mt-5 grid gap-3">
              {sorted.map((release) => {
                const recommended = isRecommendedBuild(release, sorted);
                return (
                  <li
                    key={release.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-border bg-white/70 px-4 py-3"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {platformLabel(release.platform, release.architecture)}
                        </span>
                        {recommended ? (
                          <StatusPill tone="good">Recommended</StatusPill>
                        ) : null}
                        {release.channel !== "STABLE" ? (
                          <StatusPill tone="info">{release.channel}</StatusPill>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        v{release.version}
                        {release.fileSizeBytes
                          ? ` · ${formatFileSize(release.fileSizeBytes)}`
                          : ""}
                        {release.checksumSha256
                          ? ` · SHA-256 ${release.checksumSha256.slice(0, 12)}…`
                          : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {release.releaseNotes ? (
                        <button
                          type="button"
                          className="rounded-2xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-strong"
                          onClick={() =>
                            setOpenNotes(
                              openNotes === release.id ? null : release.id,
                            )
                          }
                        >
                          {openNotes === release.id
                            ? "Hide notes"
                            : "Release notes"}
                        </button>
                      ) : null}
                      {/* Always the app route, never a storage URL. */}
                      <a
                        className="rounded-2xl bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent-strong"
                        href={`/api${release.downloadPath}`}
                      >
                        Download
                      </a>
                    </div>

                    {openNotes === release.id && release.releaseNotes ? (
                      <div className="w-full rounded-[14px] border border-border bg-surface-strong/40 px-3 py-2 text-xs leading-5 text-muted">
                        {release.releaseNotes}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
