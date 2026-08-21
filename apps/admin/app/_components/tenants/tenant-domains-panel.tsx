"use client";

import { useState } from "react";
import {
  ProDataTable,
  type ProDataTableColumn,
} from "@/app/_components/crm/data-table";
import { formatDate } from "@/lib/formatters";
import {
  DefinitionList,
  DialogField,
  PanelButton,
  PanelCard,
  PanelDialog,
  PanelEmptyState,
  PanelError,
  PanelLoading,
  StatePill,
  dialogInputClass,
} from "./tenant-panel-ui";
import {
  describeError,
  tenantRequest,
  useTenantResource,
} from "./tenant-control-plane.client";

type TenantDomainRow = {
  id: string;
  hostname: string;
  type: "SYSTEM_SUBDOMAIN" | "CUSTOM_DOMAIN";
  status: "PENDING" | "VERIFIED" | "FAILED" | "DISABLED";
  tlsStatus: "NOT_REQUIRED" | "PENDING" | "ACTIVE" | "FAILED";
  isPrimary: boolean;
  verifiedAt: string | null;
  disabledAt: string | null;
  verificationFailureReason: string | null;
  createdAt: string;
  verificationRecord: { type: string; name: string; value: string } | null;
};

type TenantDomainsView = {
  workspaceSlug: string;
  routing: {
    platformEnvironment: string;
    tenantBaseDomain: string;
    appHost: string;
    apiHost: string;
    wildcardDnsConfigured: boolean;
  };
  domains: TenantDomainRow[];
};

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "neutral"
> = {
  VERIFIED: "success",
  PENDING: "warning",
  FAILED: "danger",
  DISABLED: "neutral",
  ACTIVE: "success",
  NOT_REQUIRED: "neutral",
};

/**
 * The hostnames a workspace answers on.
 *
 * Only actions the platform can actually perform are offered. "Retry
 * verification" records an attempt and shows the DNS record the customer must
 * publish — it does not claim to have checked DNS, because this deployment has
 * no resolver integration and a domain that falsely reads VERIFIED is a domain
 * that becomes routable.
 */
export function TenantDomainsPanel({ tenantId }: { tenantId: string }) {
  const { data, loading, error, reload, setData } =
    useTenantResource<TenantDomainsView>(tenantId, "/domains");
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  async function act(
    domainId: string,
    action: "primary" | "verify" | "disable",
    successMessage: string,
  ) {
    setBusyId(domainId);
    setNotice(null);
    try {
      const result = await tenantRequest<
        TenantDomainsView | { domains: TenantDomainRow[]; message?: string }
      >(tenantId, `/domains/${domainId}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if ("workspaceSlug" in result) {
        setData(result);
        setNotice({ tone: "success", text: successMessage });
      } else {
        reload();
        setNotice({
          tone: "success",
          text: result.message ?? successMessage,
        });
      }
    } catch (reason) {
      setNotice({
        tone: "error",
        text: describeError(
          reason,
          "The domain action could not be completed.",
        ),
      });
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data)
    return (
      <PanelCard title="Domains">
        <PanelLoading label="workspace domains" />
      </PanelCard>
    );
  if (error && !data)
    return (
      <PanelCard title="Domains">
        <PanelError message={error} onRetry={reload} />
      </PanelCard>
    );
  if (!data) return null;

  const columns: ProDataTableColumn<TenantDomainRow>[] = [
    {
      key: "hostname",
      header: "Hostname",
      minWidth: 240,
      render: (row) => (
        <div className="min-w-0">
          <p className="break-all font-medium text-slate-900">{row.hostname}</p>
          {row.isPrimary ? (
            <span className="mt-0.5 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900">
              Primary
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      minWidth: 150,
      render: (row) =>
        row.type === "SYSTEM_SUBDOMAIN"
          ? "DijiPeople subdomain"
          : "Custom domain",
    },
    {
      key: "status",
      header: "Status",
      minWidth: 130,
      render: (row) => (
        <StatePill
          value={row.status}
          tone={STATUS_TONE[row.status] ?? "neutral"}
        />
      ),
    },
    {
      key: "tlsStatus",
      header: "TLS",
      minWidth: 150,
      render: (row) => (
        <StatePill
          value={row.tlsStatus}
          tone={STATUS_TONE[row.tlsStatus] ?? "neutral"}
        />
      ),
    },
    {
      key: "verifiedAt",
      header: "Verified",
      minWidth: 130,
      render: (row) => (row.verifiedAt ? formatDate(row.verifiedAt) : "—"),
    },
    {
      key: "actions",
      header: "Actions",
      minWidth: 260,
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <PanelButton
            busy={busyId === row.id}
            disabled={row.isPrimary || row.status === "DISABLED"}
            title={
              row.status !== "VERIFIED" && row.type === "CUSTOM_DOMAIN"
                ? "A custom domain must be verified before it can be primary."
                : undefined
            }
            onClick={() =>
              void act(row.id, "primary", "Primary domain changed.")
            }
          >
            Set primary
          </PanelButton>
          {row.type === "CUSTOM_DOMAIN" && row.status !== "VERIFIED" ? (
            <PanelButton
              busy={busyId === row.id}
              onClick={() =>
                void act(row.id, "verify", "Verification attempted.")
              }
            >
              Retry verification
            </PanelButton>
          ) : null}
          <PanelButton
            variant="danger"
            busy={busyId === row.id}
            disabled={row.isPrimary || row.status === "DISABLED"}
            title={
              row.isPrimary
                ? "Make another hostname primary before disabling this one."
                : undefined
            }
            onClick={() => void act(row.id, "disable", "Hostname disabled.")}
          >
            Disable
          </PanelButton>
        </div>
      ),
    },
  ];

  const pendingCustom = data.domains.filter(
    (row) => row.type === "CUSTOM_DOMAIN" && row.verificationRecord,
  );

  return (
    <PanelCard
      title="Domains"
      description="Hostnames this workspace answers on. Exactly one is primary, and every generated link uses it."
      actions={
        <PanelButton onClick={() => setAddOpen(true)}>
          Add custom domain
        </PanelButton>
      }
    >
      {notice ? (
        <p
          role="status"
          className={`mb-4 rounded-lg px-3 py-2 text-xs ${
            notice.tone === "error"
              ? "bg-rose-50 text-rose-800"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <DefinitionList
        columns={3}
        items={[
          { label: "Workspace slug", value: data.workspaceSlug },
          {
            label: "Tenant base domain",
            value: data.routing.tenantBaseDomain || "Not configured",
          },
          {
            label: "Platform wildcard DNS",
            value: (
              <StatePill
                value={
                  data.routing.wildcardDnsConfigured
                    ? "Configured"
                    : "Not configured"
                }
                tone={
                  data.routing.wildcardDnsConfigured ? "success" : "warning"
                }
              />
            ),
            /*
             * Deliberately phrased as a platform fact. Nothing here probes this
             * tenant's DNS, so it must not read as "this tenant is verified".
             */
            hint: "Platform-level setting for *.<base domain>. Not a per-tenant DNS check.",
          },
        ]}
      />

      <div className="mt-5">
        {data.domains.length ? (
          <ProDataTable
            rows={data.domains}
            rowKey={(row) => row.id}
            compact
            columns={columns}
          />
        ) : (
          <PanelEmptyState
            title="This workspace has no hostname yet."
            description="Provisioning issues a DijiPeople subdomain automatically. If none exists, Operations → Workspace health will say why and can issue one — Retry provisioning cannot, because it is refused once the tenant is active."
          />
        )}
      </div>

      {pendingCustom.length ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Awaiting proof of domain control
          </p>
          <p className="mt-1 text-xs text-amber-900">
            The customer must publish this record before the hostname can be
            verified. DijiPeople never activates a custom hostname just because
            it was typed in.
          </p>
          {pendingCustom.map((row) => (
            <dl key={row.id} className="mt-3 grid gap-1 text-xs">
              <div className="flex flex-wrap gap-2">
                <dt className="font-semibold text-amber-900">
                  {row.verificationRecord!.type}
                </dt>
                <dd className="break-all font-mono text-amber-950">
                  {row.verificationRecord!.name}
                </dd>
              </div>
              <dd className="break-all font-mono text-amber-950">
                {row.verificationRecord!.value}
              </dd>
            </dl>
          ))}
        </div>
      ) : null}

      {addOpen ? (
        <AddCustomDomainDialog
          tenantId={tenantId}
          onClose={() => setAddOpen(false)}
          onAdded={(next) => {
            setData(next);
            setAddOpen(false);
            setNotice({
              tone: "success",
              text: "Custom domain added. It stays pending until the customer proves control.",
            });
          }}
        />
      ) : null}
    </PanelCard>
  );
}

function AddCustomDomainDialog({
  tenantId,
  onClose,
  onAdded,
}: {
  tenantId: string;
  onClose: () => void;
  onAdded: (next: TenantDomainsView) => void;
}) {
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <PanelDialog
      title="Add a custom domain"
      description="The hostname is registered as pending and issued a verification challenge. It cannot serve the workspace or become primary until control is proven."
      onClose={onClose}
      footer={
        <>
          <PanelButton onClick={onClose}>Cancel</PanelButton>
          <PanelButton
            variant="primary"
            busy={busy}
            disabled={!hostname.trim().includes(".")}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const next = await tenantRequest<TenantDomainsView>(
                  tenantId,
                  "/domains",
                  {
                    method: "POST",
                    body: JSON.stringify({ hostname: hostname.trim() }),
                  },
                );
                onAdded(next);
              } catch (reason) {
                setError(
                  describeError(reason, "The domain could not be added."),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Add domain
          </PanelButton>
        </>
      }
    >
      <DialogField
        label="Hostname"
        required
        hint="A fully qualified hostname the customer controls, for example hr.maseergroup.com."
      >
        <input
          className={dialogInputClass}
          value={hostname}
          onChange={(event) => setHostname(event.target.value)}
          placeholder="hr.maseergroup.com"
          autoComplete="off"
        />
      </DialogField>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}
    </PanelDialog>
  );
}
