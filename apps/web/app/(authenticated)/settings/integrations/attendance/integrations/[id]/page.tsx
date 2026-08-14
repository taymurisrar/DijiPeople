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
  connectionModeLabel,
  describeSchedule,
  formatDateTime,
  readinessSignals,
  statusLabel,
  statusTone,
} from "../../_lib/presentation";
import type { ConnectorDetail, IntegrationDetail } from "../../_lib/types";
import { IntegrationActions } from "./_components/integration-actions";

/**
 * Integration detail.
 *
 * Only sections with real content in this slice are rendered. There are no
 * Devices, Health or Sync History tabs here: those pages do not exist yet, and
 * an empty tab reads as a broken feature rather than an unbuilt one.
 */
export default async function AttendanceIntegrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.INTEGRATIONS_READ,
    PERMISSION_KEYS.INTEGRATIONS_MANAGE,
  ]);

  const canManage = hasSettingsPermission(
    user,
    PERMISSION_KEYS.INTEGRATIONS_MANAGE,
  );

  let integration: IntegrationDetail;
  try {
    integration = await apiRequestJson<IntegrationDetail>(
      `/integrations/attendance/integrations/${id}`,
    );
  } catch {
    // The API returns the same not-found for a missing record and one belonging
    // to another tenant, so this leaks nothing either way.
    notFound();
  }

  const connector = await apiRequestJson<ConnectorDetail>(
    `/integrations/attendance/connectors/${encodeURIComponent(integration.connectorType)}`,
  ).catch(() => null);

  const signals = readinessSignals(
    integration.readiness,
    integration.connectionMode,
    integration.status,
  );

  const configFields = connector?.configurationSchema.fields ?? [];

  return (
    <SettingsShell
      eyebrow="Integrations"
      title={integration.name}
      description={
        connector?.displayName ??
        `${integration.provider} · ${connectionModeLabel(integration.connectionMode)}`
      }
      actions={
        <Link
          className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
          href="/settings/integrations/attendance/integrations"
        >
          Back to integrations
        </Link>
      }
    >
      <div className="grid gap-6">
        <SectionCard
          title="General"
          description="What this integration connects to."
        >
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailRow
              label="Status"
              value={
                <StatusPill tone={statusTone(integration.status)}>
                  {statusLabel(integration.status)}
                </StatusPill>
              }
            />
            <DetailRow
              label="Connector"
              value={connector?.displayName ?? integration.connectorType}
            />
            <DetailRow
              label="Connection"
              value={connectionModeLabel(integration.connectionMode)}
            />
            <DetailRow
              label="Gateway"
              value={
                integration.gateway?.name ??
                (integration.connectionMode === "LOCAL_GATEWAY"
                  ? "Not assigned"
                  : "Not needed")
              }
            />
            <DetailRow
              label="Devices"
              value={String(integration.deviceCount)}
            />
            <DetailRow
              label="Last successful sync"
              value={formatDateTime(integration.lastSuccessfulSyncAt)}
            />
          </dl>

          {integration.description ? (
            <p className="mt-4 text-sm leading-6 text-muted">
              {integration.description}
            </p>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Readiness"
          description="Each requirement is satisfied independently. All of them must be met before attendance can be collected."
        >
          <ul className="divide-y divide-border" data-testid="readiness-list">
            {signals.map((signal) => (
              <li
                key={signal.key}
                className="flex flex-wrap items-start justify-between gap-3 py-3"
                data-testid={`readiness-${signal.key}`}
              >
                <div className="min-w-[12rem]">
                  <p className="text-sm font-semibold text-foreground">
                    {signal.label}
                  </p>
                  {signal.detail ? (
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
                      {signal.detail}
                    </p>
                  ) : null}
                </div>
                <StatusPill tone={signal.tone}>{signal.value}</StatusPill>
              </li>
            ))}
          </ul>

          <div className="mt-5">
            <IntegrationActions
              integrationId={integration.id}
              status={integration.status}
              readiness={integration.readiness}
              canManage={canManage}
            />
          </div>
        </SectionCard>

        {configFields.length > 0 ? (
          <SectionCard
            title="Configuration"
            description="Connection settings for this integration. Secrets are stored encrypted and are never shown again."
          >
            <dl className="grid gap-4 sm:grid-cols-2">
              {configFields.map((field) => {
                const isSecret = field.secret || field.type === "secret";
                const secret = integration.secrets[field.key];
                const value = integration.configuration[field.key];

                return (
                  <div key={field.key}>
                    <dt className="text-sm text-muted">{field.label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-foreground">
                      {isSecret ? (
                        secret?.configured ? (
                          <span
                            className="inline-flex items-center gap-2"
                            data-testid={`secret-${field.key}`}
                          >
                            <span aria-hidden="true">
                              {secret.masked ?? "••••••"}
                            </span>
                            <StatusPill tone="good">Configured</StatusPill>
                          </span>
                        ) : (
                          <StatusPill tone="muted">Not set</StatusPill>
                        )
                      ) : value === undefined || value === null || value === "" ? (
                        "—"
                      ) : (
                        String(value)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Sync schedule"
          description="How often DijiPeople collects attendance once this integration is active."
        >
          {integration.syncPolicy ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailRow
                label="Schedule"
                value={describeSchedule(integration.syncPolicy)}
              />
              <DetailRow
                label="Last attempted sync"
                value={formatDateTime(integration.lastSyncAt)}
              />
            </dl>
          ) : (
            <p className="text-sm text-muted">
              No schedule is assigned, so this integration will not collect
              attendance automatically.
            </p>
          )}

          {connector ? (
            <p className="mt-4 text-xs leading-5 text-muted">
              Recommended for {connector.displayName}: every{" "}
              {connector.recommendedSync.recommendedIntervalValue}{" "}
              {connector.recommendedSync.recommendedIntervalUnit.toLowerCase()}.
              Minimum {connector.recommendedSync.minimumIntervalMinutes} minutes.
            </p>
          ) : null}
        </SectionCard>
      </div>
    </SettingsShell>
  );
}

function DetailRow({
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
