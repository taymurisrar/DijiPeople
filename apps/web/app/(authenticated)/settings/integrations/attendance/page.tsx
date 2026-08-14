import Link from "next/link";

import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../_components/settings-shell";
import {
  hasSettingsPermission,
  requireSettingsPermissions,
} from "../../_lib/require-settings-permission";
import {
  formatDateTime,
  statusLabel,
  statusTone,
} from "./_lib/presentation";
import type {
  DeviceListResponse,
  ExternalUserListResponse,
  GatewayListResponse,
  IntegrationListResponse,
  ProvisioningListResponse,
} from "./_lib/types";

/**
 * Attendance integration overview.
 *
 * Every number here is derived from the integrations API. Device, gateway and
 * mapping cards are deliberately absent: their pages do not exist yet in this
 * slice, and a card showing "0 devices" would read as a fact about the tenant
 * rather than a feature that has not shipped.
 *
 * The layout is a plain responsive grid so those cards can be added later
 * without rework.
 */
export default async function AttendanceIntegrationsOverviewPage() {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.INTEGRATIONS_READ,
    PERMISSION_KEYS.INTEGRATIONS_MANAGE,
  ]);

  const canManage = hasSettingsPermission(
    user,
    PERMISSION_KEYS.INTEGRATIONS_MANAGE,
  );

  let integrations: IntegrationListResponse = {
    items: [],
    page: 1,
    pageSize: 200,
    total: 0,
  };
  let loadError: string | null = null;

  try {
    integrations = await apiRequestJson<IntegrationListResponse>(
      "/integrations/attendance/integrations?pageSize=200",
    );
  } catch {
    // A failed load must not blank the page; the shell still renders with a
    // readable message.
    loadError =
      "Attendance integrations could not be loaded. Refresh to try again.";
  }

  // Each of these degrades to zero rather than failing the page, so one slow or
  // unavailable endpoint cannot take the overview down.
  const [devices, gateways, mapping, provisioning] = await Promise.all([
    apiRequestJson<DeviceListResponse>(
      "/integrations/attendance/devices?pageSize=200",
    ).catch(() => ({ items: [], page: 1, pageSize: 200, total: 0 })),
    apiRequestJson<GatewayListResponse>(
      "/integrations/gateways?pageSize=200",
    ).catch(() => ({ items: [], page: 1, pageSize: 200, total: 0 })),
    apiRequestJson<ExternalUserListResponse>(
      "/integrations/attendance/external-users?pageSize=200",
    ).catch(() => ({ items: [], page: 1, pageSize: 200, total: 0 })),
    apiRequestJson<ProvisioningListResponse>(
      "/integrations/attendance/provisioning-jobs?pageSize=200",
    ).catch(() => ({ items: [], page: 1, pageSize: 200, total: 0 })),
  ]);

  const deviceCounts = {
    total: devices.total,
    enabled: devices.items.filter((device) => device.isEnabled).length,
    // Every device reads UNKNOWN until a gateway checks it; that is expected.
    unchecked: devices.items.filter(
      (device) => device.healthStatus === "UNKNOWN",
    ).length,
  };

  const gatewayCounts = {
    total: gateways.total,
    online: gateways.items.filter((gateway) => gateway.status === "ONLINE")
      .length,
    awaitingPairing: gateways.items.filter((gateway) => !gateway.isPaired)
      .length,
  };

  const mappingCounts = {
    mapped: mapping.items.filter((user) => user.mappingStatus === "MATCHED")
      .length,
    unmapped: mapping.items.filter((user) => user.mappingStatus === "UNMATCHED")
      .length,
    conflict: mapping.items.filter((user) => user.mappingStatus === "CONFLICT")
      .length,
  };

  const provisioningCounts = {
    pending: provisioning.items.filter(
      (job) => job.status === "PENDING" || job.status === "RETRYING",
    ).length,
    failed: provisioning.items.filter((job) => job.status === "FAILED").length,
  };

  const counts = integrations.items.reduce(
    (totals, integration) => {
      totals.total += 1;
      if (integration.status === "ACTIVE") totals.active += 1;
      else if (integration.status === "UNVERIFIED") totals.unverified += 1;
      else if (integration.status === "DISABLED") totals.disabled += 1;
      else if (integration.status === "DRAFT") totals.draft += 1;
      else if (integration.status === "ERROR") totals.error += 1;
      return totals;
    },
    { total: 0, active: 0, unverified: 0, disabled: 0, draft: 0, error: 0 },
  );

  const lastSuccessful = integrations.items
    .map((integration) => integration.lastSuccessfulSyncAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  const awaitingAttention = integrations.items.filter(
    (integration) =>
      integration.status === "DRAFT" ||
      integration.status === "UNVERIFIED" ||
      integration.status === "ERROR",
  );

  return (
    <SettingsShell
      eyebrow="Integrations"
      title="Attendance integrations"
      description="Connect attendance terminals and attendance platforms to DijiPeople, and keep an eye on what still needs setting up."
      actions={
        canManage ? (
          <Link
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/settings/integrations/attendance/integrations/new"
          >
            Add integration
          </Link>
        ) : null
      }
    >
      <div className="grid gap-6">
        {loadError ? (
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            {loadError}
          </div>
        ) : null}

        {counts.total === 0 && !loadError ? (
          <EmptyState
            title="No attendance integrations configured"
            description="Connect an attendance terminal or attendance platform so DijiPeople can collect attendance automatically."
            action={
              canManage ? (
                <Link
                  className="inline-flex rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
                  href="/settings/integrations/attendance/integrations/new"
                >
                  Add integration
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            <SectionCard
              title="Integrations"
              description="How your configured attendance sources are currently set up."
            >
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryTile label="Total" value={counts.total} />
                <SummaryTile label="Active" value={counts.active} tone="good" />
                <SummaryTile
                  label="Unverified"
                  value={counts.unverified}
                  tone="warning"
                />
                <SummaryTile
                  label="Disabled"
                  value={counts.disabled}
                  tone="muted"
                />
              </dl>

              {counts.draft > 0 || counts.error > 0 ? (
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  {counts.draft > 0 ? (
                    <StatusPill tone="muted">
                      {counts.draft} in draft
                    </StatusPill>
                  ) : null}
                  {counts.error > 0 ? (
                    <StatusPill tone="danger">
                      {counts.error} reporting an error
                    </StatusPill>
                  ) : null}
                </div>
              ) : null}
            </SectionCard>

            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard
                title="Devices"
                description="Terminals registered against your integrations."
              >
                <dl className="grid gap-4 sm:grid-cols-3">
                  <SummaryTile label="Total" value={deviceCounts.total} />
                  <SummaryTile
                    label="Enabled"
                    value={deviceCounts.enabled}
                    tone="good"
                  />
                  <SummaryTile
                    label="Not checked"
                    value={deviceCounts.unchecked}
                    tone="muted"
                  />
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted">
                  Device health is reported once a gateway can reach the
                  terminal.
                </p>
              </SectionCard>

              <SectionCard
                title="Gateways"
                description="On-premise gateways that reach devices inside your network."
              >
                <dl className="grid gap-4 sm:grid-cols-3">
                  <SummaryTile label="Total" value={gatewayCounts.total} />
                  <SummaryTile
                    label="Online"
                    value={gatewayCounts.online}
                    tone="good"
                  />
                  <SummaryTile
                    label="Awaiting pairing"
                    value={gatewayCounts.awaitingPairing}
                    tone="warning"
                  />
                </dl>
              </SectionCard>

              <SectionCard
                title="Employee mapping"
                description="Device users matched to DijiPeople employees."
              >
                <dl className="grid gap-4 sm:grid-cols-3">
                  <SummaryTile
                    label="Mapped"
                    value={mappingCounts.mapped}
                    tone="good"
                  />
                  <SummaryTile
                    label="Unmapped"
                    value={mappingCounts.unmapped}
                    tone="warning"
                  />
                  <SummaryTile
                    label="Needs review"
                    value={mappingCounts.conflict}
                    tone="warning"
                  />
                </dl>
              </SectionCard>

              <SectionCard
                title="Provisioning"
                description="Employee records queued for your attendance devices."
              >
                <dl className="grid gap-4 sm:grid-cols-3">
                  <SummaryTile
                    label="Queued"
                    value={provisioningCounts.pending}
                  />
                  <SummaryTile
                    label="Failed"
                    value={provisioningCounts.failed}
                    tone="warning"
                  />
                  <SummaryTile
                    label="Last successful sync"
                    value={0}
                    tone="muted"
                    display={
                      lastSuccessful ? formatDateTime(lastSuccessful) : "Not yet"
                    }
                  />
                </dl>
              </SectionCard>
            </div>

            {awaitingAttention.length > 0 ? (
              <SectionCard
                title="Needs attention"
                description="These integrations are configured but not yet collecting attendance."
              >
                <ul className="divide-y divide-border">
                  {awaitingAttention.slice(0, 8).map((integration) => (
                    <li
                      key={integration.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <Link
                          className="text-sm font-semibold text-foreground hover:text-accent"
                          href={`/settings/integrations/attendance/integrations/${integration.id}`}
                        >
                          {integration.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted">
                          {integration.connectorType}
                        </p>
                      </div>
                      <StatusPill tone={statusTone(integration.status)}>
                        {statusLabel(integration.status)}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}
          </>
        )}

        <SectionCard
          title="Quick actions"
          description="Jump straight to the things you are most likely to need."
        >
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
              href="/settings/integrations/attendance/integrations"
            >
              View integrations
            </Link>
            <Link
              className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
              href="/settings/integrations/attendance/devices"
            >
              View devices
            </Link>
            {mappingCounts.unmapped + mappingCounts.conflict > 0 ? (
              <Link
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
                href="/settings/integrations/attendance/mapping"
              >
                Review unmapped users (
                {mappingCounts.unmapped + mappingCounts.conflict})
              </Link>
            ) : null}
            {provisioningCounts.failed > 0 ? (
              <Link
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
                href="/settings/integrations/attendance/provisioning"
              >
                View failed provisioning ({provisioningCounts.failed})
              </Link>
            ) : null}
            {canManage ? (
              <>
                <Link
                  className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
                  href="/settings/integrations/attendance/integrations/new"
                >
                  Add integration
                </Link>
                <Link
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
                  href="/settings/integrations/attendance/gateways/new"
                >
                  Set up gateway
                </Link>
              </>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </SettingsShell>
  );
}

function SummaryTile({
  label,
  value,
  tone = "neutral",
  display,
}: {
  label: string;
  value: number;
  tone?: "good" | "warning" | "muted" | "neutral";
  /** Overrides the numeral, for tiles that show a date rather than a count. */
  display?: string;
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "muted"
          ? "text-slate-600"
          : "text-foreground";

  return (
    <div className="rounded-[18px] border border-border bg-white/70 px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={`mt-1 font-semibold ${valueClass} ${display ? "text-sm" : "text-2xl"}`}
      >
        {display ?? value}
      </dd>
    </div>
  );
}
