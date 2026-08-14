import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../../../_components/settings-shell";
import {
  hasSettingsPermission,
  requireSettingsPermissions,
} from "../../../../_lib/require-settings-permission";
import {
  capabilityPresentation,
  describeClockDrift,
  deviceHealthLabel,
  deviceHealthTone,
  deviceStatusLabel,
  deviceStatusTone,
  deviceVerificationLabel,
  deviceVerificationTone,
  directionModeLabel,
  formatDateTime,
} from "../../_lib/presentation";
import type {
  ConnectorDetail,
  DeviceDetail,
  DeviceScopesResponse,
} from "../../_lib/types";
import { DeviceScopes } from "./_components/device-scopes";
import { DeviceStateActions } from "./_components/device-state-actions";

type LookupOption = { id: string; name: string };

function normaliseLookup(
  payload: { items?: LookupOption[] } | LookupOption[] | null,
): LookupOption[] {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : (payload.items ?? []);
}

/**
 * Device detail.
 *
 * Only sections with real content render. There is no Sync History or
 * Capabilities tab: those depend on the gateway runtime, and an empty tab reads
 * as a broken feature rather than an unbuilt one.
 */
export default async function AttendanceDeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.ATTENDANCE_DEVICES_READ,
    PERMISSION_KEYS.ATTENDANCE_DEVICES_MANAGE,
  ]);

  const canManage = hasSettingsPermission(
    user,
    PERMISSION_KEYS.ATTENDANCE_DEVICES_MANAGE,
  );

  let device: DeviceDetail;
  try {
    device = await apiRequestJson<DeviceDetail>(
      `/integrations/attendance/devices/${id}`,
    );
  } catch {
    notFound();
  }

  const [scopes, connector, organizations, businessUnits, departments, teams] =
    await Promise.all([
      apiRequestJson<DeviceScopesResponse>(
        `/integrations/attendance/devices/${id}/scopes`,
      ).catch(() => ({ items: [], defaultBehaviour: "" })),
      // Capabilities belong to the connector, not the device row, so they are
      // read from the connector definition rather than restated on the device.
      device.integration?.connectorType
        ? apiRequestJson<ConnectorDetail>(
            `/integrations/attendance/connectors/${device.integration.connectorType}`,
          ).catch(() => null)
        : Promise.resolve(null),
      apiRequestJson<{ items?: LookupOption[] } | LookupOption[]>(
        "/organizations",
      ).catch(() => []),
      apiRequestJson<{ items?: LookupOption[] } | LookupOption[]>(
        "/business-units",
      ).catch(() => []),
      apiRequestJson<{ items?: LookupOption[] } | LookupOption[]>(
        "/departments",
      ).catch(() => []),
      apiRequestJson<{ items?: LookupOption[] } | LookupOption[]>(
        "/teams",
      ).catch(() => []),
    ]);

  return (
    <SettingsShell
      eyebrow="Integrations"
      title={device.name}
      description={
        device.integration
          ? `Part of ${device.integration.name}`
          : "Attendance device"
      }
      actions={
        <div className="flex flex-wrap gap-3">
          {canManage ? (
            <Link
              className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
              href={`/settings/integrations/attendance/devices/${device.id}/edit`}
            >
              Edit
            </Link>
          ) : null}
          <Link
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
            href="/settings/integrations/attendance/devices"
          >
            Back to devices
          </Link>
        </div>
      }
    >
      <div className="grid gap-6">
        <SectionCard title="General" description="What this device is.">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Row
              label="Status"
              value={
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone={deviceStatusTone(device.status)}>
                    {deviceStatusLabel(device.status)}
                  </StatusPill>
                  {!device.isEnabled ? (
                    <StatusPill tone="muted">Disabled</StatusPill>
                  ) : null}
                </div>
              }
            />
            <Row
              label="Health"
              value={
                <StatusPill tone={deviceHealthTone(device.healthStatus)}>
                  {deviceHealthLabel(device.healthStatus)}
                </StatusPill>
              }
            />
            <Row
              label="Verification"
              value={
                <StatusPill
                  tone={deviceVerificationTone(device.verificationStatus)}
                >
                  {deviceVerificationLabel(device.verificationStatus)}
                </StatusPill>
              }
            />
            <Row label="Manufacturer" value={device.provider} />
            <Row label="Model" value={device.model ?? "—"} />
            <Row label="Serial number" value={device.serialNumber ?? "—"} />
            {/* Shown only when it differs. Reconciling it silently would erase
                the evidence that the wrong terminal is answering. */}
            {device.serialMatches === false ? (
              <Row
                label="Serial reported by device"
                value={
                  <span className="font-medium text-red-600">
                    {device.actualSerialNumber ?? "—"}
                  </span>
                }
              />
            ) : null}
            <Row label="MAC address" value={device.macAddress ?? "—"} />
            <Row
              label="Device clock"
              value={
                device.lastDeviceTimeLocal
                  ? `${device.lastDeviceTimeLocal}${
                      typeof device.lastClockDriftSeconds === "number"
                        ? ` (${describeClockDrift(device.lastClockDriftSeconds)})`
                        : ""
                    }`
                  : "—"
              }
            />
            <Row
              label="Records"
              value={directionModeLabel(device.directionMode)}
            />
            <Row label="Last seen" value={formatDateTime(device.lastSeenAt)} />
            <Row
              label="Last verified"
              value={formatDateTime(device.lastVerifiedAt)}
            />
            <Row
              label="Last successful sync"
              value={formatDateTime(device.lastSuccessfulSyncAt)}
            />
          </dl>

          {device.healthStatus === "UNKNOWN" ? (
            <p className="mt-4 text-xs leading-5 text-muted">
              Health is reported once a gateway reaches this device. Install and
              pair a gateway, then use Sync now to have it check.
            </p>
          ) : null}

          {device.lastVerificationError ? (
            <p className="mt-4 text-xs leading-5 text-red-600" role="alert">
              {device.lastVerificationError}
            </p>
          ) : null}

          {canManage ? (
            <div className="mt-5">
              <DeviceStateActions
                deviceId={device.id}
                isEnabled={device.isEnabled}
                syncRequestPending={device.syncRequestPending ?? false}
              />
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Connection"
          description="How the gateway reaches this device on your network."
        >
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="Address" value={device.host ?? "—"} />
            <Row
              label="Port"
              value={device.port !== null ? String(device.port) : "—"}
            />
            <Row
              label="Device ID"
              value={
                device.machineNumber !== null
                  ? String(device.machineNumber)
                  : "—"
              }
            />
            <Row label="Timezone" value={device.timezone ?? "—"} />
            <Row
              label="Work site"
              value={device.workSite?.name ?? "Not assigned"}
            />
            <Row label="Gateway" value={device.gateway?.name ?? "—"} />
          </dl>
        </SectionCard>

        {connector ? (
          <SectionCard
            title="Capabilities"
            description={`What the ${connector.displayName} connector can do with this device.`}
          >
            <ul className="divide-y divide-border">
              {connector.capabilities.map((capability) => {
                const presented = capabilityPresentation(capability, connector);
                return (
                  <li
                    key={capability}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="max-w-xl">
                      <p className="text-sm font-semibold text-foreground">
                        {presented.label}
                      </p>
                      {presented.detail ? (
                        <p className="mt-0.5 text-xs leading-5 text-muted">
                          {presented.detail}
                        </p>
                      ) : null}
                    </div>
                    <StatusPill tone={presented.tone}>
                      {presented.state}
                    </StatusPill>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Who can use this device"
          description="Access follows the work site unless you add a restriction."
        >
          <DeviceScopes
            deviceId={device.id}
            workSiteName={device.workSite?.name ?? null}
            scopes={scopes.items}
            defaultBehaviour={scopes.defaultBehaviour}
            lookups={{
              organizations: normaliseLookup(organizations),
              businessUnits: normaliseLookup(businessUnits),
              departments: normaliseLookup(departments),
              teams: normaliseLookup(teams),
            }}
            canManage={canManage}
          />
        </SectionCard>

        <SectionCard
          title="Related"
          description="Where to look next for this device."
        >
          <div className="flex flex-wrap gap-3">
            {device.integration ? (
              <RelatedLink
                href={`/settings/integrations/attendance/integrations/${device.integration.id}`}
                label="View integration"
              />
            ) : null}
            {device.gateway ? (
              <RelatedLink
                href={`/settings/integrations/attendance/gateways/${device.gateway.id}`}
                label="View gateway"
              />
            ) : null}
            <RelatedLink
              href={`/settings/integrations/attendance/sync-history?deviceId=${device.id}`}
              label="View sync history"
            />
            <RelatedLink
              href={`/settings/integrations/attendance/mapping?deviceId=${device.id}`}
              label="View device users"
            />
          </div>
        </SectionCard>
      </div>
    </SettingsShell>
  );
}

function RelatedLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
      href={href}
    >
      {label}
    </Link>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
