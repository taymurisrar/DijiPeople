"use client";

import Link from "next/link";
import {
    ArrowLeft,
    ArrowRight,
    Plus,
    RefreshCw,
    Trash2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModuleListLayout } from "@/app/_components/crm/module-list-layout";
import { PaginationControl } from "@/app/_components/crm/pagination-control";
import { RecordRibbonBar } from "@/app/_components/crm/record-ribbon-bar";
import { SearchBar } from "@/app/_components/crm/search-bar";
import { SortControl } from "@/app/_components/crm/sort-control";
import { StatusSelector } from "@/app/_components/crm/status-selector";
import { DataTable } from "@/app/_components/crm/data-table";
import {
    DataTableHeaderMenu,
    DataTableHeaderMenuActions,
    DataTableHeaderMenuSection,
} from "@/app/_components/crm/data-table-header-menu";
import { FeatureChip } from "@/app/_components/ui/feature-chip";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import type {
    BillingCycleValue,
    SubscriptionStatusValue,
    TenantStatusValue,
} from "@/lib/domain";
import {
    formatBillingCycle,
    formatCurrency,
    formatDate,
    formatNumber,
} from "@/lib/formatters";

export type TenantSubscription = {
    plan: {
        id: string;
        key: string;
        name: string;
    };
    status: SubscriptionStatusValue | string;
    billingCycle: BillingCycleValue | string;
    finalPrice: number;
    currency: string;
};

export type TenantSummary = {
    id: string;
    name: string;
    slug: string;
    status: TenantStatusValue | string;
    createdAt: string;
    updatedAt: string;
    customerAccount: {
        id: string;
        companyName: string;
        status: string;
    } | null;
    userCount: number;
    employeeCount: number;
    enabledFeatures: string[];
    subscription: TenantSubscription | null;
};

type TenantListManagerProps = {
    initialData: TenantSummary[];
    currentFilters: {
        status?: string;
        subscriptionStatus?: string;
        search?: string;
        sortField?: string;
        sortDirection?: string;
        page?: string;
    };
};

type TableColumn = {
    key: string;
    header: React.ReactNode;
    render: (tenant: TenantSummary, index: number) => React.ReactNode;
    headerClassName?: string;
    cellClassName?: string;
    minWidth?: string | number;
    width?: string | number;
    align?: "left" | "center" | "right";
};

const TENANT_STATUS_OPTIONS = [
    "ACTIVE",
    "ONBOARDING",
    "SUSPENDED",
    "INACTIVE",
    "ARCHIVED",
];

const SUBSCRIPTION_STATUS_OPTIONS = [
    "ACTIVE",
    "TRIALING",
    "PAST_DUE",
    "CANCELLED",
    "EXPIRED",
];

function normalizeLabel(value: string) {
    return value.replaceAll("_", " ");
}

export function TenantListManager({
    initialData,
    currentFilters,
}: TenantListManagerProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [message, setMessage] = useState<string | null>(null);

    const entityLogicalName = "Tenants";
    const viewDisplayName = "Default view";

    function updateFilter(name: string, value: string) {
        const search = new URLSearchParams(window.location.search);

        if (value) {
            search.set(name, value);
        } else {
            search.delete(name);
        }

        if (name !== "page") {
            search.delete("page");
        }

        router.push(`/tenants${search.toString() ? `?${search.toString()}` : ""}`);
    }

    function updateSort(field: string, direction: string) {
        const search = new URLSearchParams(window.location.search);

        search.set("sortField", field);
        search.set("sortDirection", direction);
        search.delete("page");

        router.push(`/tenants?${search.toString()}`);
    }

    function toggleRow(id: string) {
        setSelectedIds((current) =>
            current.includes(id)
                ? current.filter((item) => item !== id)
                : [...current, id],
        );
    }

    function toggleAll(checked?: boolean) {
        if (!checked || selectedIds.length === initialData.length) {
            setSelectedIds([]);
            return;
        }

        setSelectedIds(initialData.map((item) => item.id));
    }

    function handleBulkDelete() {
        if (selectedIds.length === 0) return;

        const confirmed = window.confirm(
            `Delete ${selectedIds.length} selected tenant${selectedIds.length === 1 ? "" : "s"
            }? This should only be allowed when no active subscription, users, or dependent records exist.`,
        );

        if (!confirmed) return;

        setMessage(null);

        startTransition(async () => {
            const response = await fetch("/api/super-admin/tenants", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: selectedIds }),
            });

            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                setMessage(payload?.message ?? "Unable to delete selected tenants.");
                return;
            }

            setSelectedIds([]);
            setMessage("Selected tenants deleted.");
            router.refresh();
        });
    }

    const columns: TableColumn[] = [
        {
            key: "tenant",
            minWidth: 300,
            header: (
                <DataTableHeaderMenu
                    label="Tenant"
                    hasFilter
                    hasSort
                    isActive={
                        Boolean(currentFilters.search) || currentFilters.sortField === "name"
                    }
                    title="Tenant options"
                    description="Search tenants by name, slug, customer, or subscription."
                    width={340}
                    align="left"
                    footer={
                        <DataTableHeaderMenuActions
                            onClear={() => {
                                updateFilter("search", "");
                                if (currentFilters.sortField === "name") {
                                    updateSort("createdAt", "desc");
                                }
                            }}
                            onApply={() => { }}
                            applyLabel="Done"
                        />
                    }
                >
                    <div className="space-y-4">
                        <DataTableHeaderMenuSection title="Search">
                            <SearchBar
                                defaultValue={currentFilters.search ?? ""}
                                onCommit={(value) => updateFilter("search", value)}
                                placeholder="Search tenant, slug, customer..."
                            />
                        </DataTableHeaderMenuSection>

                        <DataTableHeaderMenuSection title="Sort">
                            <SortControl
                                direction={
                                    currentFilters.sortField === "name"
                                        ? currentFilters.sortDirection ?? "asc"
                                        : "asc"
                                }
                                onChange={(next) => updateSort(next.value, next.direction)}
                                options={[{ value: "name", label: "Tenant name" }]}
                                value="name"
                            />
                        </DataTableHeaderMenuSection>
                    </div>
                </DataTableHeaderMenu>
            ),
            render: (tenant) => (
                <>
                    <Link
                        href={`/tenants/${tenant.id}`}
                        className="font-medium text-slate-950 hover:text-slate-700"
                    >
                        {tenant.name}
                    </Link>

                    <div className="mt-1 font-mono text-xs text-slate-500">
                        {tenant.slug}
                    </div>
                </>
            ),
        },
        {
            key: "customer",
            minWidth: 260,
            header: <span className="font-medium text-slate-600">Customer</span>,
            render: (tenant) =>
                tenant.customerAccount ? (
                    <Link
                        href={`/customers/${tenant.customerAccount.id}`}
                        className="font-medium text-slate-950 hover:text-slate-700"
                    >
                        {tenant.customerAccount.companyName}
                    </Link>
                ) : (
                    <span className="text-slate-500">No customer account</span>
                ),
        },
        {
            key: "status",
            minWidth: 180,
            header: (
                <DataTableHeaderMenu
                    label="Status"
                    hasFilter
                    hasSort
                    isActive={
                        Boolean(currentFilters.status) ||
                        currentFilters.sortField === "status"
                    }
                    title="Status options"
                    description="Filter or sort tenants by lifecycle status."
                    width={320}
                    align="left"
                    footer={
                        <DataTableHeaderMenuActions
                            onClear={() => {
                                updateFilter("status", "");
                                if (currentFilters.sortField === "status") {
                                    updateSort("createdAt", "desc");
                                }
                            }}
                            onApply={() => { }}
                            applyLabel="Done"
                        />
                    }
                >
                    <div className="space-y-4">
                        <DataTableHeaderMenuSection title="Filter">
                            <StatusSelector
                                label="Status"
                                onChange={(value) => updateFilter("status", value)}
                                options={[
                                    { value: "", label: "All statuses" },
                                    ...TENANT_STATUS_OPTIONS.map((status) => ({
                                        value: status,
                                        label: normalizeLabel(status),
                                    })),
                                ]}
                                value={currentFilters.status ?? ""}
                            />
                        </DataTableHeaderMenuSection>

                        <DataTableHeaderMenuSection title="Sort">
                            <SortControl
                                direction={
                                    currentFilters.sortField === "status"
                                        ? currentFilters.sortDirection ?? "desc"
                                        : "desc"
                                }
                                onChange={(next) => updateSort(next.value, next.direction)}
                                options={[{ value: "status", label: "Status" }]}
                                value="status"
                            />
                        </DataTableHeaderMenuSection>
                    </div>
                </DataTableHeaderMenu>
            ),
            render: (tenant) => <TenantStatusBadge value={tenant.status} />,
        },
        {
            key: "plan",
            minWidth: 200,
            header: <span className="font-medium text-slate-600">Plan</span>,
            render: (tenant) =>
                tenant.subscription ? (
                    <div className="font-medium text-slate-950">
                        {tenant.subscription.plan.name}
                    </div>
                ) : (
                    <span className="text-slate-500">Not configured</span>
                ),
        },
        {
            key: "billing",
            minWidth: 190,
            header: (
                <DataTableHeaderMenu
                    label="Billing"
                    hasFilter
                    hasSort
                    isActive={
                        Boolean(currentFilters.subscriptionStatus) ||
                        currentFilters.sortField === "subscription"
                    }
                    title="Billing options"
                    description="Filter tenants by subscription state or sort by subscription."
                    width={340}
                    align="left"
                    footer={
                        <DataTableHeaderMenuActions
                            onClear={() => {
                                updateFilter("subscriptionStatus", "");
                                if (currentFilters.sortField === "subscription") {
                                    updateSort("createdAt", "desc");
                                }
                            }}
                            onApply={() => { }}
                            applyLabel="Done"
                        />
                    }
                >
                    <div className="space-y-4">
                        <DataTableHeaderMenuSection title="Filter">
                            <StatusSelector
                                label="Subscription status"
                                onChange={(value) => updateFilter("subscriptionStatus", value)}
                                options={[
                                    { value: "", label: "All subscriptions" },
                                    ...SUBSCRIPTION_STATUS_OPTIONS.map((status) => ({
                                        value: status,
                                        label: normalizeLabel(status),
                                    })),
                                ]}
                                value={currentFilters.subscriptionStatus ?? ""}
                            />
                        </DataTableHeaderMenuSection>

                        <DataTableHeaderMenuSection title="Sort">
                            <SortControl
                                direction={
                                    currentFilters.sortField === "subscription"
                                        ? currentFilters.sortDirection ?? "desc"
                                        : "desc"
                                }
                                onChange={(next) => updateSort(next.value, next.direction)}
                                options={[{ value: "subscription", label: "Subscription" }]}
                                value="subscription"
                            />
                        </DataTableHeaderMenuSection>
                    </div>
                </DataTableHeaderMenu>
            ),
            render: (tenant) =>
                tenant.subscription ? (
                    <>
                        <TenantStatusBadge value={tenant.subscription.status} />
                        <div className="mt-2 text-xs text-slate-500">
                            {formatBillingCycle(tenant.subscription.billingCycle)}
                        </div>
                    </>
                ) : (
                    <span className="text-slate-500">No subscription</span>
                ),
        },
        {
            key: "mrr",
            minWidth: 150,
            align: "right",
            header: <span className="font-medium text-slate-600">MRR</span>,
            render: (tenant) => {
                if (!tenant.subscription) {
                    return <span className="text-slate-500">—</span>;
                }

                const isAnnual =
                    String(tenant.subscription.billingCycle).toUpperCase() === "ANNUAL";

                const monthlyValue = isAnnual
                    ? tenant.subscription.finalPrice / 12
                    : tenant.subscription.finalPrice;

                return (
                    <span className="font-medium text-slate-950">
                        {formatCurrency(monthlyValue, tenant.subscription.currency)}
                    </span>
                );
            },
            cellClassName: "text-right",
        },
        {
            key: "users",
            minWidth: 140,
            align: "right",
            header: (
                <DataTableHeaderMenu
                    label="Users"
                    hasSort
                    isActive={currentFilters.sortField === "userCount"}
                    title="Users options"
                    description="Sort tenants by number of users."
                    width={280}
                    align="right"
                    footer={
                        <DataTableHeaderMenuActions
                            onClear={() => updateSort("createdAt", "desc")}
                            onApply={() => { }}
                            applyLabel="Done"
                        />
                    }
                >
                    <DataTableHeaderMenuSection title="Sort">
                        <SortControl
                            direction={
                                currentFilters.sortField === "userCount"
                                    ? currentFilters.sortDirection ?? "desc"
                                    : "desc"
                            }
                            onChange={(next) => updateSort(next.value, next.direction)}
                            options={[{ value: "userCount", label: "Users" }]}
                            value="userCount"
                        />
                    </DataTableHeaderMenuSection>
                </DataTableHeaderMenu>
            ),
            render: (tenant) => formatNumber(tenant.userCount),
            cellClassName: "text-right font-medium text-slate-950",
        },
        {
            key: "employees",
            minWidth: 150,
            align: "right",
            header: (
                <DataTableHeaderMenu
                    label="Employees"
                    hasSort
                    isActive={currentFilters.sortField === "employeeCount"}
                    title="Employees options"
                    description="Sort tenants by number of employees."
                    width={280}
                    align="right"
                    footer={
                        <DataTableHeaderMenuActions
                            onClear={() => updateSort("createdAt", "desc")}
                            onApply={() => { }}
                            applyLabel="Done"
                        />
                    }
                >
                    <DataTableHeaderMenuSection title="Sort">
                        <SortControl
                            direction={
                                currentFilters.sortField === "employeeCount"
                                    ? currentFilters.sortDirection ?? "desc"
                                    : "desc"
                            }
                            onChange={(next) => updateSort(next.value, next.direction)}
                            options={[{ value: "employeeCount", label: "Employees" }]}
                            value="employeeCount"
                        />
                    </DataTableHeaderMenuSection>
                </DataTableHeaderMenu>
            ),
            render: (tenant) => formatNumber(tenant.employeeCount),
            cellClassName: "text-right font-medium text-slate-950",
        },
        {
            key: "features",
            minWidth: 280,
            header: <span className="font-medium text-slate-600">Features</span>,
            render: (tenant) => {
                const featurePreview = tenant.enabledFeatures.slice(0, 2);
                const extraFeatureCount = Math.max(
                    tenant.enabledFeatures.length - featurePreview.length,
                    0,
                );

                if (featurePreview.length === 0) {
                    return <span className="text-slate-500">No features</span>;
                }

                return (
                    <div className="flex flex-wrap gap-2">
                        {featurePreview.map((feature) => (
                            <FeatureChip key={`${tenant.id}-${feature}`} value={feature} />
                        ))}

                        {extraFeatureCount > 0 ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                                +{extraFeatureCount} more
                            </span>
                        ) : null}
                    </div>
                );
            },
        },
        {
            key: "updatedAt",
            minWidth: 180,
            header: (
                <DataTableHeaderMenu
                    label="Updated"
                    hasSort
                    isActive={currentFilters.sortField === "updatedAt"}
                    title="Updated date options"
                    description="Sort tenants by last update date."
                    width={280}
                    align="left"
                    footer={
                        <DataTableHeaderMenuActions
                            onClear={() => updateSort("createdAt", "desc")}
                            onApply={() => { }}
                            applyLabel="Done"
                        />
                    }
                >
                    <DataTableHeaderMenuSection title="Sort">
                        <SortControl
                            direction={
                                currentFilters.sortField === "updatedAt"
                                    ? currentFilters.sortDirection ?? "desc"
                                    : "desc"
                            }
                            onChange={(next) => updateSort(next.value, next.direction)}
                            options={[{ value: "updatedAt", label: "Updated date" }]}
                            value="updatedAt"
                        />
                    </DataTableHeaderMenuSection>
                </DataTableHeaderMenu>
            ),
            render: (tenant) => formatDate(tenant.updatedAt),
            cellClassName: "text-slate-500",
        },
        {
            key: "actions",
            minWidth: 150,
            header: <span className="font-medium text-slate-600">Actions</span>,
            render: (tenant) => (
                <Link
                    href={`/tenants/${tenant.id}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                    Open
                    <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            ),
        },
    ];

    return (
        <ModuleListLayout
            title="Tenants"
            description="Manage tenant workspaces, customer ownership, subscriptions, enabled features, and platform adoption from one operational view."
            ribbon={
                <div className="flex flex-col gap-3">
                    <RecordRibbonBar
                        left={
                            <>
                                <button
                                    aria-label="Back"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100"
                                    onClick={() => router.back()}
                                    title="Back"
                                    type="button"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </button>

                                <button
                                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                    onClick={() => router.push("/tenants/new")}
                                    type="button"
                                >
                                    <Plus className="h-4 w-4" />
                                    <span>New</span>
                                </button>

                                <button
                                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                                    disabled={selectedIds.length === 0 || isPending}
                                    onClick={handleBulkDelete}
                                    type="button"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    <span>Delete</span>
                                </button>

                                <button
                                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                    onClick={() => router.refresh()}
                                    type="button"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    <span>Refresh</span>
                                </button>
                            </>
                        }
                        right={<></>}
                    />

                    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-xl font-semibold text-slate-900">
                                    {entityLogicalName}
                                </h2>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                                <span>{viewDisplayName}</span>
                            </div>
                        </div>
                    </div>
                </div>
            }
            pagination={
                <PaginationControl
                    page={Number(currentFilters.page ?? 1)}
                    totalPages={1}
                />
            }
        >
            <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-950">
                            Tenant directory
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                            {formatNumber(initialData.length)} tenant workspace
                            {initialData.length === 1 ? "" : "s"} found across the platform.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {message ? (
                            <p className="text-sm text-slate-600">{message}</p>
                        ) : null}

                        <button
                            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                            disabled={selectedIds.length === 0}
                            onClick={() => setSelectedIds([])}
                            type="button"
                        >
                            Clear selection
                        </button>
                    </div>
                </div>

                <DataTable
                    columns={columns}
                    rowKey={(item) => item.id}
                    rows={initialData}
                    selectable
                    selectedRowIds={selectedIds}
                    onToggleAll={toggleAll}
                    onToggleRow={toggleRow}
                    stickyHeader
                    zebra
                    hoverable
                    emptyTitle="No tenants found"
                    emptyDescription="Tenant workspaces will appear here when customer onboarding creates or activates a tenant."
                />
            </div>
        </ModuleListLayout>
    );
}