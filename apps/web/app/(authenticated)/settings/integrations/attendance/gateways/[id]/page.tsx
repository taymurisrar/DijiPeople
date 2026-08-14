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
  formatDateTime,
  gatewayStatusLabel,
  gatewayStatusTone,
} from "../../_lib/presentation";
import type { GatewayDetail } from "../../_lib/types";
import {
  GatewayAdminActions,
  GatewayCredentialList,
} from "./_components/gateway-admin-actions";

export default async function GatewayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.GATEWAYS_READ,
    PERMISSION_KEYS.GATEWAYS_MANAGE,
  ]);

  const canManage = hasSettingsPermission(
    user,
    PERMISSION_KEYS.GATEWAYS_MANAGE,
  );

  let gateway: GatewayDetail;
  try {
    gateway = await apiRequestJson<GatewayDetail>(
      `/integrations/gateways/${id}`,
    );
  } catch {
    notFound();
  }

  return (
    <SettingsShell
      eyebrow="Integrations"
      title={gateway.name}
      description={gateway.description ?? "Integration gateway"}
      actions={
        <Link
          className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
          href="/settings/integrations/attendance/gateways"
        >
          Back to gateways
        </Link>
      }
    >
      <div className="grid gap-6">
        <SectionCard
          title="Status"
          description="How this gateway is connecting to DijiPeople."
        >
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Row
              label="Status"
              value={
                <StatusPill tone={gatewayStatusTone(gateway.status)}>
                  {gatewayStatusLabel(gateway.status)}
                </StatusPill>
              }
            />
            <Row
              label="Paired"
              value={gateway.isPaired ? "Yes" : "Not yet"}
            />
            <Row
              label="Registered"
              value={formatDateTime(gateway.registeredAt)}
            />
            <Row
              label="Last contact"
              value={formatDateTime(gateway.lastHeartbeatAt)}
            />
            <Row label="Version" value={gateway.version ?? "—"} />
            <Row
              label="Platform"
              value={
                gateway.platform
                  ? `${gateway.platform}${gateway.architecture ? ` · ${gateway.architecture}` : ""}`
                  : "—"
              }
            />
            <Row
              label="Integrations"
              value={String(gateway.integrationCount)}
            />
            <Row label="Devices" value={String(gateway.deviceCount)} />
          </dl>

          {!gateway.isPaired && !gateway.revokedAt ? (
            <p className="mt-4 text-xs leading-5 text-muted">
              This gateway has not contacted DijiPeople yet. Generate a pairing
              code and enter it in the gateway installer.
            </p>
          ) : null}
        </SectionCard>

        {canManage ? (
          <SectionCard
            title="Administration"
            description="Pairing, credential rotation and revocation."
          >
            <GatewayAdminActions
              gatewayId={gateway.id}
              gatewayName={gateway.name}
              isRevoked={Boolean(gateway.revokedAt)}
            />
          </SectionCard>
        ) : null}

        {gateway.credentials ? (
          <SectionCard
            title="Credentials"
            description="Secrets are never shown again after they are issued. Only the identifying prefix is stored here."
          >
            <GatewayCredentialList credentials={gateway.credentials} />
          </SectionCard>
        ) : null}
      </div>
    </SettingsShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
