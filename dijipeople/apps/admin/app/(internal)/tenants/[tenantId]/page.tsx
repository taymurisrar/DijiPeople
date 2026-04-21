import Link from "next/link";
import { PermissionAssignmentPanel } from "@/app/_components/permission-assignment-panel";
import { SubscriptionForm } from "@/app/_components/subscription-form";
import { TenantFeatureForm } from "@/app/_components/tenant-feature-form";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { TenantStatusForm } from "@/app/_components/tenant-status-form";
import { apiRequestJson } from "@/lib/server-api";

type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  status: "ONBOARDING" | "ACTIVE" | "SUSPENDED" | "CHURNED";
  createdAt: string;
  updatedAt: string;
  customerAccount: {
    id: string;
    companyName: string;
    status: string;
    contactEmail: string;
  } | null;
  counts: {
    users: number;
    employees: number;
  };
  enabledFeatures: Array<{
    id: string;
    key: string;
    isEnabled: boolean;
    isIncludedInPlan: boolean;
    tenantOverrideEnabled: boolean | null;
  }>;
  subscription: {
    id: string;
    plan: {
      id: string;
      key: string;
      name: string;
    };
    status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
    billingCycle: "MONTHLY" | "ANNUAL";
    basePrice: number;
    discountType: "NONE" | "PERCENTAGE" | "FLAT";
    discountValue: number;
    discountReason: string | null;
    finalPrice: number;
    currency: string;
    startDate: string;
    endDate: string | null;
    renewalDate: string | null;
    autoRenew: boolean;
    updatedAt: string;
  } | null;
};

type PlanOption = {
  id: string;
  key: string;
  name: string;
  monthlyBasePrice: number;
  annualBasePrice: number;
  currency: string;
};

type FeatureCatalogItem = {
  key: string;
  label: string;
  description: string;
};

type PermissionItem = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
};

type TenantRole = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissionIds: string[];
};

type TenantUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  isServiceAccount?: boolean;
  roles: Array<{
    id: string;
    key: string;
    name: string;
  }>;
  directPermissionIds: string[];
};

type SearchParams = Promise<{
  tab?: "overview" | "billing" | "access";
}>;

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function getEnabledFeatures(features: TenantDetail["enabledFeatures"]) {
  return features.filter((feature) => feature.isEnabled);
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: SearchParams;
}) {
  const { tenantId } = await params;
  const resolvedSearchParams = await searchParams;
  const activeTab = resolvedSearchParams.tab ?? "overview";

  const [tenant, plans, featureCatalog, permissions, roles, users] = await Promise.all([
    apiRequestJson<TenantDetail>(`/super-admin/tenants/${tenantId}`),
    apiRequestJson<PlanOption[]>("/super-admin/plans"),
    apiRequestJson<FeatureCatalogItem[]>("/super-admin/feature-catalog"),
    apiRequestJson<PermissionItem[]>(`/super-admin/tenants/${tenantId}/permissions`),
    apiRequestJson<TenantRole[]>(`/super-admin/tenants/${tenantId}/roles`),
    apiRequestJson<TenantUser[]>(`/super-admin/tenants/${tenantId}/users`),
  ]);

  const enabledFeatures = getEnabledFeatures(tenant.enabledFeatures);
  const featurePreview = enabledFeatures.slice(0, 6);

  return (
    <main className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
              <Link
                href="/tenants"
                className="inline-flex text-sm font-medium text-slate-500 transition hover:text-slate-950"
              >
                ← Back to tenants
              </Link>

              <div className="space-y-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                    {tenant.name}
                  </h1>
                  <div className="shrink-0">
                    <TenantStatusBadge value={tenant.status} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                  <span>
                    Slug: <span className="font-medium text-slate-900">{tenant.slug}</span>
                  </span>
                  {tenant.customerAccount ? (
                    <span>
                      Customer:{" "}
                      <Link
                        href={`/customers/${tenant.customerAccount.id}`}
                        className="font-medium text-slate-900 transition hover:text-slate-700"
                      >
                        {tenant.customerAccount.companyName}
                      </Link>
                    </span>
                  ) : (
                    <span>No linked customer</span>
                  )}
                  <span>Created: {formatDate(tenant.createdAt)}</span>
                  <span>Updated: {formatDate(tenant.updatedAt)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[460px]">
              <CompactStatCard label="Users" value={tenant.counts.users} />
              <CompactStatCard label="Employees" value={tenant.counts.employees} />
              <CompactStatCard label="Enabled features" value={enabledFeatures.length} />
              <CompactStatCard
                label="Plan"
                value={tenant.subscription?.plan.name ?? "Not set"}
                valueClassName="text-base sm:text-lg"
              />
            </div>
          </div>

          <nav className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <TabLink
              href={`/tenants/${tenantId}?tab=overview`}
              label="Overview"
              isActive={activeTab === "overview"}
            />
            <TabLink
              href={`/tenants/${tenantId}?tab=billing`}
              label="Billing"
              isActive={activeTab === "billing"}
            />
            <TabLink
              href={`/tenants/${tenantId}?tab=access`}
              label="Access"
              isActive={activeTab === "access"}
            />
          </nav>
        </div>
      </section>

      {activeTab === "overview" ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
          <div className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-slate-950">Feature access</h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600">
                    Manage which capabilities are available for this tenant without forcing
                    the page to feel like one long settings wall.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">
                    {enabledFeatures.length} feature{enabledFeatures.length === 1 ? "" : "s"} enabled
                  </p>
                  <p className="mt-1 text-slate-500">
                    {tenant.enabledFeatures.length} total in catalog for this tenant
                  </p>
                </div>
              </div>

              {featurePreview.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {featurePreview.map((feature) => (
                    <span
                      key={feature.id}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      {feature.key}
                    </span>
                  ))}
                  {enabledFeatures.length > featurePreview.length ? (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                      +{enabledFeatures.length - featurePreview.length} more
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  No features are enabled for this tenant yet.
                </div>
              )}

              <div className="mt-5 border-t border-slate-200 pt-5">
                <TenantFeatureForm
                  catalog={featureCatalog}
                  features={tenant.enabledFeatures}
                  tenantId={tenant.id}
                />
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Tenant snapshot</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Fast read of plan, billing, and lifecycle state.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <InfoRow label="Tenant status" value={<TenantStatusBadge value={tenant.status} />} />
                <InfoRow
                  label="Subscription status"
                  value={
                    tenant.subscription ? (
                      <TenantStatusBadge value={tenant.subscription.status} />
                    ) : (
                      "No subscription"
                    )
                  }
                />
                <InfoRow
                  label="Plan"
                  value={tenant.subscription?.plan.name ?? "Not assigned"}
                />
                <InfoRow
                  label="Billing cycle"
                  value={
                    tenant.subscription
                      ? toTitleCase(tenant.subscription.billingCycle)
                      : "Not assigned"
                  }
                />
                <InfoRow
                  label="Renewal"
                  value={
                    tenant.subscription?.renewalDate
                      ? formatDate(tenant.subscription.renewalDate)
                      : "Not scheduled"
                  }
                />
                <InfoRow
                  label="Customer email"
                  value={tenant.customerAccount?.contactEmail ?? "Not available"}
                />
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-slate-950">Quick actions</h2>
              <p className="mt-1 text-sm text-slate-600">
                High-impact actions kept visible without making the page noisy.
              </p>

              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-900">Update subscription</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Change plan, pricing, discount, or renewal setup.
                  </p>
                  <div className="mt-4">
                    <SubscriptionForm
                      currentSubscription={tenant.subscription}
                      plans={plans}
                      tenantId={tenant.id}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-900">Change tenant status</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Control onboarding, activation, suspension, or churn state.
                  </p>
                  <div className="mt-4">
                    <TenantStatusForm tenantId={tenant.id} currentStatus={tenant.status} />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "billing" ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-950">Subscription management</h2>
              <p className="text-sm leading-6 text-slate-600">
                Keep billing actions focused in one place instead of spreading them across the page.
              </p>
            </div>

            <div className="mt-6">
              <SubscriptionForm
                currentSubscription={tenant.subscription}
                plans={plans}
                tenantId={tenant.id}
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-semibold text-slate-950">Subscription summary</h2>

            {tenant.subscription ? (
              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <SummaryGridItem label="Plan" value={tenant.subscription.plan.name} />
                <SummaryGridItem
                  label="Status"
                  value={<TenantStatusBadge value={tenant.subscription.status} />}
                />
                <SummaryGridItem
                  label="Billing cycle"
                  value={toTitleCase(tenant.subscription.billingCycle)}
                />
                <SummaryGridItem
                  label="Currency"
                  value={tenant.subscription.currency}
                />
                <SummaryGridItem
                  label="Base price"
                  value={`${tenant.subscription.currency} ${tenant.subscription.basePrice.toFixed(2)}`}
                />
                <SummaryGridItem
                  label="Final price"
                  value={`${tenant.subscription.currency} ${tenant.subscription.finalPrice.toFixed(2)}`}
                />
                <SummaryGridItem
                  label="Discount"
                  value={
                    tenant.subscription.discountType === "NONE"
                      ? "No discount"
                      : `${toTitleCase(tenant.subscription.discountType)} • ${tenant.subscription.discountValue}`
                  }
                />
                <SummaryGridItem
                  label="Auto renew"
                  value={tenant.subscription.autoRenew ? "Enabled" : "Disabled"}
                />
                <SummaryGridItem
                  label="Start date"
                  value={formatDate(tenant.subscription.startDate)}
                />
                <SummaryGridItem
                  label="End date"
                  value={tenant.subscription.endDate ? formatDate(tenant.subscription.endDate) : "Open-ended"}
                />
                <SummaryGridItem
                  label="Renewal date"
                  value={
                    tenant.subscription.renewalDate
                      ? formatDate(tenant.subscription.renewalDate)
                      : "Not scheduled"
                  }
                />
                <SummaryGridItem
                  label="Last updated"
                  value={formatDate(tenant.subscription.updatedAt)}
                />
              </dl>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                No subscription record exists yet for this tenant.
              </div>
            )}
          </section>
        </section>
      ) : null}

      {activeTab === "access" ? (
        <section className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-950">Access control</h2>
              <p className="text-sm leading-6 text-slate-600">
                Advanced role and direct permission management lives here so the main tenant page
                stays short and easier to scan.
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <CompactStatCard label="Roles" value={roles.length} />
              <CompactStatCard label="Users" value={users.length} />
              <CompactStatCard label="Permissions" value={permissions.length} />
            </div>
          </section>

          <PermissionAssignmentPanel
            emptyMessage="No tenant roles were found for this tenant."
            permissions={permissions}
            subjects={roles.map((role) => ({
              id: role.id,
              label: `${role.name}${role.isSystem ? " (System Role)" : ""}`,
              meta: `${role.key}${role.description ? ` • ${role.description}` : ""}`,
              patchUrl: `/api/super-admin/tenants/${tenantId}/roles/${role.id}/permissions`,
              permissionIds: role.permissionIds,
            }))}
            title="Role permission assignment"
          />

          <PermissionAssignmentPanel
            emptyMessage="No tenant users were found for this tenant."
            permissions={permissions}
            subjects={users.map((user) => ({
              id: user.id,
              label: `${user.firstName} ${user.lastName}`,
              meta: `${user.email} • ${user.status}${user.isServiceAccount ? " • service account" : ""} • Roles: ${
                user.roles.length ? user.roles.map((role) => role.name).join(", ") : "None"
              }`,
              patchUrl: `/api/super-admin/tenants/${tenantId}/users/${user.id}/permissions`,
              permissionIds: user.directPermissionIds,
            }))}
            title="Direct user permission assignment"
          />
        </section>
      ) : null}
    </main>
  );
}

function CompactStatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number | string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={cx("mt-2 truncate text-2xl font-semibold text-slate-950", valueClassName)}>
        {value}
      </p>
    </div>
  );
}

function TabLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition",
        isActive
          ? "bg-slate-950 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-950",
      )}
    >
      {label}
    </Link>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-950">{value}</dd>
    </div>
  );
}

function SummaryGridItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-medium text-slate-950">{value}</dd>
    </div>
  );
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}