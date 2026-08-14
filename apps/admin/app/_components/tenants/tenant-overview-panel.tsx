"use client";

import Link from "next/link";
import { formatCurrency, formatDate, formatEnumLabel } from "@/lib/formatters";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import {
  DefinitionList,
  PanelCard,
  PanelEmptyState,
  PanelError,
  PanelLoading,
  StatTile,
  StatePill,
  relativeTime,
} from "./tenant-panel-ui";
import {
  useTenantResource,
  type TenantOverview,
  type TenantReadiness,
} from "./tenant-control-plane.client";

/**
 * The Overview tab.
 *
 * It answers the questions a Platform Admin actually opens a tenant to answer —
 * is it working, who owns it, what is it paying for, is anything broken — rather
 * than listing the tenant table's columns. Every value shown is one the platform
 * records; nothing is estimated to fill a card.
 */
export function TenantOverviewPanel({
  tenantId,
  onNavigateTab,
}: {
  tenantId: string;
  onNavigateTab: (tab: string) => void;
}) {
  const { data, loading, error, reload } = useTenantResource<TenantOverview>(
    tenantId,
    "/overview",
  );

  if (loading && !data)
    return (
      <PanelCard title="Tenant snapshot">
        <PanelLoading label="the tenant snapshot" />
      </PanelCard>
    );
  if (error && !data)
    return (
      <PanelCard title="Tenant snapshot">
        <PanelError message={error} onRetry={reload} />
      </PanelCard>
    );
  if (!data) return null;

  const { summary, readiness, counts, customer, attribution } = data;

  return (
    <div className="space-y-5">
      <ReadinessCard readiness={readiness} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Tenant status"
          value={<TenantStatusBadge value={summary.tenantStatus} />}
          detail={
            summary.statusReason ??
            (summary.tenantAccessBlocked
              ? "Tenant users cannot sign in while the workspace is in this state."
              : "Tenant users can sign in.")
          }
          tone={
            summary.tenantStatus === "ACTIVE"
              ? "success"
              : summary.tenantStatus === "SUSPENDED" ||
                  summary.tenantStatus === "PROVISIONING_FAILED"
                ? "danger"
                : "neutral"
          }
        />
        <StatTile
          label="Workspace"
          value={
            summary.workspace.domain ? (
              <span className="break-all text-base">
                {summary.workspace.domain}
              </span>
            ) : (
              "Not provisioned"
            )
          }
          detail={
            summary.workspace.verificationStatus
              ? `DNS ${formatEnumLabel(summary.workspace.verificationStatus)}${
                  summary.workspace.sslStatus
                    ? ` · TLS ${formatEnumLabel(summary.workspace.sslStatus)}`
                    : ""
                }`
              : "No workspace domain has been reserved."
          }
          tone={
            summary.workspace.verificationStatus === "VERIFIED"
              ? "success"
              : summary.workspace.domain
                ? "warning"
                : "danger"
          }
        />
        <StatTile
          label="Subscription"
          value={summary.subscription?.plan.name ?? "No subscription"}
          detail={
            summary.subscription
              ? `${formatEnumLabel(summary.subscription.status)} · ${formatEnumLabel(
                  summary.subscription.billingCycle,
                )} · ${formatCurrency(
                  summary.subscription.finalPrice,
                  summary.subscription.currency,
                )}`
              : "Provisioning creates the subscription from the agreed plan."
          }
          tone={
            summary.subscription?.status === "ACTIVE" ||
            summary.subscription?.status === "TRIALING"
              ? "success"
              : "warning"
          }
        />
        <StatTile
          label="Tenant Owners"
          value={`${summary.owners.active} active`}
          detail={
            summary.owners.primary
              ? `Primary: ${summary.owners.primary.fullName}`
              : "No primary Tenant Owner is assigned."
          }
          tone={summary.owners.active > 0 ? "success" : "danger"}
        />
        <StatTile
          label="Modules"
          value={`${summary.modules.enabled} of ${summary.modules.total}`}
          detail={
            summary.modules.overrides
              ? `${summary.modules.overrides} tenant override${summary.modules.overrides === 1 ? "" : "s"}`
              : "Following the plan entitlement."
          }
          tone={summary.modules.enabled > 0 ? "neutral" : "danger"}
        />
        <StatTile
          label="Apps"
          value={`${summary.apps.assigned} assigned`}
          detail={
            summary.apps.updatesAvailable
              ? `${summary.apps.updatesAvailable} update${summary.apps.updatesAvailable === 1 ? "" : "s"} available`
              : summary.apps.gatewayCount
                ? `${summary.apps.gatewaysOnline} of ${summary.apps.gatewayCount} gateways online`
                : "All assigned apps are current."
          }
          tone={summary.apps.updatesAvailable ? "warning" : "neutral"}
        />
        <StatTile
          label="Provisioning"
          value={
            summary.provisioning.status
              ? formatEnumLabel(summary.provisioning.status)
              : "Not recorded"
          }
          detail={
            summary.provisioning.completedAt
              ? `Completed ${relativeTime(summary.provisioning.completedAt)}`
              : summary.provisioning.hasRecordedRuns
                ? (summary.provisioning.message ?? "In progress.")
                : "This tenant was provisioned before run history was recorded."
          }
          tone={
            summary.provisioning.status === "FAILED"
              ? "danger"
              : summary.provisioning.status === "RUNNING"
                ? "warning"
                : "neutral"
          }
        />
        <StatTile
          label="Open support"
          value={summary.openSupportCaseCount}
          detail={
            summary.failedJobCount
              ? `${summary.failedJobCount} failed background job${summary.failedJobCount === 1 ? "" : "s"}`
              : summary.lastActivity
                ? `Last activity ${relativeTime(summary.lastActivity.occurredAt)}`
                : "No recorded activity."
          }
          tone={
            summary.openSupportCaseCount || summary.failedJobCount
              ? "warning"
              : "neutral"
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <PanelCard
          title="Tenant information"
          description="The business identity of this workspace."
        >
          <DefinitionList
            items={[
              { label: "Tenant name", value: data.header.title },
              { label: "Tenant code", value: summary.workspace.slug },
              {
                label: "Customer",
                value: customer ? (
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-semibold text-[var(--admin-primary)] hover:underline"
                  >
                    {customer.companyName}
                  </Link>
                ) : (
                  "Not linked"
                ),
              },
              {
                label: "Workspace URL",
                value: summary.workspace.url ? (
                  <a
                    href={summary.workspace.url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-semibold text-[var(--admin-primary)] hover:underline"
                  >
                    {summary.workspace.url}
                  </a>
                ) : (
                  "Not provisioned"
                ),
              },
              {
                label: "Lifecycle status",
                value: <TenantStatusBadge value={summary.tenantStatus} />,
              },
              { label: "Created", value: formatDate(data.header.createdAt) },
              {
                label: "Primary Tenant Owner",
                value: summary.owners.primary ? (
                  <span>
                    {summary.owners.primary.fullName}
                    <span className="block text-xs font-normal text-slate-500">
                      {summary.owners.primary.email}
                    </span>
                  </span>
                ) : (
                  "Not assigned"
                ),
              },
              {
                label: "People and structure",
                value: `${counts.employees} employees · ${counts.organizations} organizations · ${counts.businessUnits} business units`,
              },
            ]}
          />
        </PanelCard>

        <div className="space-y-5">
          <PanelCard
            title="Subscription"
            description="Commercial terms recorded against this tenant."
            actions={
              <button
                type="button"
                onClick={() => onNavigateTab("commercial")}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                View Commercial
              </button>
            }
          >
            {summary.subscription ? (
              <DefinitionList
                items={[
                  { label: "Plan", value: summary.subscription.plan.name },
                  {
                    label: "Status",
                    value: (
                      <TenantStatusBadge value={summary.subscription.status} />
                    ),
                  },
                  {
                    label: "Billing cycle",
                    value: formatEnumLabel(summary.subscription.billingCycle),
                  },
                  {
                    label: "Purchased seats",
                    value: summary.subscription.purchasedSeats,
                  },
                  {
                    label: "Start date",
                    value: formatDate(summary.subscription.startDate),
                  },
                  {
                    label: "Renewal",
                    value: summary.subscription.renewalDate
                      ? formatDate(summary.subscription.renewalDate)
                      : summary.subscription.autoRenew
                        ? "Auto-renewing"
                        : "Not scheduled",
                  },
                ]}
              />
            ) : (
              <PanelEmptyState
                title="No subscription is linked to this tenant."
                description="A subscription is created when the tenant is provisioned from an onboarding cycle with an agreed plan."
              />
            )}
          </PanelCard>

          <PanelCard
            title="Apps and modules"
            description="What this workspace is entitled to run."
            actions={
              <button
                type="button"
                onClick={() => onNavigateTab("apps-modules")}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                View Apps &amp; Modules
              </button>
            }
          >
            <DefinitionList
              columns={2}
              items={[
                {
                  label: "Modules enabled",
                  value: `${summary.modules.enabled} of ${summary.modules.total}`,
                },
                {
                  label: "Tenant overrides",
                  value: summary.modules.overrides,
                },
                {
                  label: "Apps assigned",
                  value: summary.apps.assigned,
                },
                {
                  label: "Update warnings",
                  value: summary.apps.updatesAvailable
                    ? `${summary.apps.updatesAvailable} available`
                    : "None",
                },
                {
                  label: "Gateways",
                  value: summary.apps.gatewayCount
                    ? `${summary.apps.gatewaysOnline} of ${summary.apps.gatewayCount} online`
                    : "None registered",
                },
              ]}
            />
          </PanelCard>

          <PanelCard
            title="Operational status"
            description="Provisioning, support and background processing."
            actions={
              <button
                type="button"
                onClick={() => onNavigateTab("operations")}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                View Operations
              </button>
            }
          >
            <DefinitionList
              columns={2}
              items={[
                {
                  label: "Provisioning",
                  value: summary.provisioning.status
                    ? formatEnumLabel(summary.provisioning.status)
                    : "Not recorded",
                  hint: summary.provisioning.failedStepKey
                    ? `Failed at ${summary.provisioning.failedStepKey}`
                    : undefined,
                },
                {
                  label: "Open support cases",
                  value: summary.openSupportCaseCount,
                },
                {
                  label: "Failed jobs",
                  value: summary.failedJobCount,
                },
                {
                  label: "Last activity",
                  value: summary.lastActivity
                    ? relativeTime(summary.lastActivity.occurredAt)
                    : "No recorded activity",
                  hint: summary.lastActivity
                    ? formatEnumLabel(summary.lastActivity.action)
                    : undefined,
                },
                {
                  label: "Originating lead",
                  value: attribution.originatingLead ? (
                    <Link
                      href={`/leads/${attribution.originatingLead.id}`}
                      className="font-semibold text-[var(--admin-primary)] hover:underline"
                    >
                      {attribution.originatingLead.label}
                    </Link>
                  ) : (
                    "Not attributed"
                  ),
                },
                {
                  label: "Originating partner",
                  value: attribution.originatingPartner ? (
                    <Link
                      href={`/partners/${attribution.originatingPartner.id}`}
                      className="font-semibold text-[var(--admin-primary)] hover:underline"
                    >
                      {attribution.originatingPartner.label}
                    </Link>
                  ) : (
                    "Direct"
                  ),
                },
              ]}
            />
          </PanelCard>
        </div>
      </div>
    </div>
  );
}

/**
 * Deterministic readiness, shown as the list of rules it checked.
 *
 * Not a score: a number between 0 and 100 tells an operator nothing they can
 * act on, whereas "Blocked — no active Tenant Owner exists" names the record to
 * go and fix.
 */
export function ReadinessCard({ readiness }: { readiness: TenantReadiness }) {
  const tone =
    readiness.status === "BLOCKED"
      ? "danger"
      : readiness.status === "WARNINGS"
        ? "warning"
        : "success";
  return (
    <PanelCard
      title="Tenant readiness"
      description="Deterministic checks against records this platform holds."
      actions={
        <StatePill
          value={
            readiness.status === "READY"
              ? "Ready"
              : readiness.status === "WARNINGS"
                ? `${readiness.warningCount} warning${readiness.warningCount === 1 ? "" : "s"}`
                : `Blocked · ${readiness.blockerCount}`
          }
          tone={tone}
        />
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {readiness.checks.map((check) => (
          <li
            key={check.key}
            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
              check.severity === "BLOCKER"
                ? "border-rose-200 bg-rose-50/70"
                : check.severity === "WARNING"
                  ? "border-amber-200 bg-amber-50/70"
                  : "border-slate-200 bg-white"
            }`}
          >
            <StatePill
              value={
                check.severity === "OK"
                  ? "OK"
                  : check.severity === "WARNING"
                    ? "Warning"
                    : "Blocked"
              }
              tone={
                check.severity === "OK"
                  ? "success"
                  : check.severity === "WARNING"
                    ? "warning"
                    : "danger"
              }
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900">
                {check.label}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-slate-600">
                {check.message}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}
