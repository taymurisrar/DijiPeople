"use client";

import Link from "next/link";
import { ArrowLeft, Plus, RefreshCw, Trash2, UserCheck } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModuleListLayout } from "@/app/_components/crm/module-list-layout";
import { OwnerSelector } from "@/app/_components/crm/owner-selector";
import { PaginationControl } from "@/app/_components/crm/pagination-control";
import { RecordRibbonBar } from "@/app/_components/crm/record-ribbon-bar";
import { SearchBar } from "@/app/_components/crm/search-bar";
import { SortControl } from "@/app/_components/crm/sort-control";
import { StatusSelector } from "@/app/_components/crm/status-selector";
import { SubStatusSelector } from "@/app/_components/crm/sub-status-selector";
import { DataTable } from "@/app/_components/crm/data-table";
import {
  DataTableHeaderMenu,
  DataTableHeaderMenuActions,
  DataTableHeaderMenuSection,
} from "@/app/_components/crm/data-table-header-menu";
import type {
  CustomerRecord,
  LifecycleOptions,
  OperatorOption,
  PaginatedResponse,
  PlanOption,
} from "./platform-lifecycle-types";

type CustomerListManagerProps = {
  initialData: PaginatedResponse<CustomerRecord>;
  lifecycleOptions: LifecycleOptions;
  operators: OperatorOption[];
  plans: PlanOption[];
  currentFilters: {
    status?: string;
    subStatus?: string;
    industry?: string;
    accountManagerUserId?: string;
    selectedPlanId?: string;
    search?: string;
    sortField?: string;
    sortDirection?: string;
  };
};

type TableColumn = {
  key: string;
  header: React.ReactNode;
  render: (customer: CustomerRecord, index: number) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  minWidth?: string | number;
  width?: string | number;
  align?: "left" | "center" | "right";
};

export function CustomerListManager({
  initialData,
  lifecycleOptions,
  operators,
  plans,
  currentFilters,
}: CustomerListManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [bulkOwnerId, setBulkOwnerId] = useState("");

  const entityLogicalName = "Customer";
  const viewDisplayName = "Default view";

  const subStatusFilterOptions = useMemo(() => {
    const allSubStatuses = Object.values(
      lifecycleOptions.customer.subStatuses,
    ).flat();

    const uniqueSubStatuses = allSubStatuses.filter(
      (status, index, array) => array.indexOf(status) === index,
    );

    return [
      { value: "", label: "All sub-statuses" },
      ...uniqueSubStatuses.map((status) => ({
        value: status,
        label: status,
      })),
    ];
  }, [lifecycleOptions.customer.subStatuses]);

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

    router.push(
      `/customers${search.toString() ? `?${search.toString()}` : ""}`,
    );
  }

  function updateSort(field: string, direction: string) {
    const search = new URLSearchParams(window.location.search);

    search.set("sortField", field);
    search.set("sortDirection", direction);
    search.delete("page");

    router.push(`/customers?${search.toString()}`);
  }

  function toggleRow(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleAll(checked?: boolean) {
    if (!checked || selectedIds.length === initialData.items.length) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(initialData.items.map((item) => item.id));
  }

  function handleBulkDelete() {
    if (selectedIds.length === 0) return;

    const confirmed = window.confirm(
      `Delete ${selectedIds.length} selected customer${
        selectedIds.length === 1 ? "" : "s"
      }?`,
    );

    if (!confirmed) return;

    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/super-admin/customers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to delete customers.");
        return;
      }

      setSelectedIds([]);
      setMessage("Selected customers deleted.");
      router.refresh();
    });
  }

  function handleBulkAssign() {
    if (selectedIds.length === 0) return;

    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/super-admin/customers/bulk/assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          accountManagerUserId: bulkOwnerId || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to assign selected customers.");
        return;
      }

      setSelectedIds([]);
      setBulkOwnerId("");
      setMessage("Selected customers updated.");
      router.refresh();
    });
  }

  const columns: TableColumn[] = [
    {
      key: "customer",
      minWidth: 300,
      header: (
        <DataTableHeaderMenu
          label="Customer"
          hasFilter
          isActive={Boolean(currentFilters.search)}
          title="Search customers"
          description="Search by company, contact, email, or phone."
          width={340}
          align="left"
          footer={
            <DataTableHeaderMenuActions
              onClear={() => updateFilter("search", "")}
              onApply={() => {}}
              applyLabel="Done"
            />
          }
        >
          <DataTableHeaderMenuSection title="Search">
            <SearchBar
              defaultValue={currentFilters.search ?? ""}
              onCommit={(value) => updateFilter("search", value)}
              placeholder="Search company, contact, email, or phone"
            />
          </DataTableHeaderMenuSection>
        </DataTableHeaderMenu>
      ),
      render: (customer) => (
        <>
          <Link
            href={`/customers/${customer.id}`}
            className="font-medium text-slate-950 hover:text-slate-700"
          >
            {customer.companyName}
          </Link>
          <div className="mt-1 text-slate-500">
            {[
              customer.primaryContactFirstName,
              customer.primaryContactLastName,
            ]
              .filter(Boolean)
              .join(" ") || "No primary contact"}
          </div>
          <div className="mt-1 text-slate-500">
            {customer.primaryContactEmail ?? "No email"}
          </div>
        </>
      ),
    },
    {
      key: "owner",
      minWidth: 220,
      header: (
        <DataTableHeaderMenu
          label="Account manager"
          hasFilter
          hasSort
          isActive={
            Boolean(currentFilters.accountManagerUserId) ||
            currentFilters.sortField === "owner"
          }
          title="Account manager options"
          description="Filter by account manager or sort this column."
          width={320}
          align="left"
          footer={
            <DataTableHeaderMenuActions
              onClear={() => {
                updateFilter("accountManagerUserId", "");
                if (currentFilters.sortField === "owner") {
                  updateSort("createdAt", "desc");
                }
              }}
              onApply={() => {}}
              applyLabel="Done"
            />
          }
        >
          <div className="space-y-4">
            <DataTableHeaderMenuSection title="Filter">
              <OwnerSelector
                label="Account manager"
                onChange={(value) =>
                  updateFilter("accountManagerUserId", value)
                }
                options={[
                  { value: "", label: "All account managers" },
                  ...operators.map((operator) => ({
                    value: operator.id,
                    label: operator.fullName,
                  })),
                ]}
                value={currentFilters.accountManagerUserId ?? ""}
              />
            </DataTableHeaderMenuSection>

            <DataTableHeaderMenuSection title="Sort">
              <SortControl
                direction={
                  currentFilters.sortField === "owner"
                    ? currentFilters.sortDirection ?? "desc"
                    : "desc"
                }
                onChange={(next) => updateSort(next.value, next.direction)}
                options={[{ value: "owner", label: "Account manager" }]}
                value="owner"
              />
            </DataTableHeaderMenuSection>
          </div>
        </DataTableHeaderMenu>
      ),
      render: (customer) =>
        customer.accountManagerUser
          ? `${customer.accountManagerUser.firstName} ${customer.accountManagerUser.lastName}`
          : "Unassigned",
      cellClassName: "text-slate-600",
    },
    {
      key: "status",
      minWidth: 240,
      header: (
        <DataTableHeaderMenu
          label="Lifecycle"
          hasFilter
          hasSort
          isActive={
            Boolean(currentFilters.status) ||
            Boolean(currentFilters.subStatus) ||
            currentFilters.sortField === "status"
          }
          title="Lifecycle options"
          description="Filter by status or sub-status and sort this column."
          width={340}
          align="left"
          footer={
            <DataTableHeaderMenuActions
              onClear={() => {
                updateFilter("status", "");
                updateFilter("subStatus", "");
                if (currentFilters.sortField === "status") {
                  updateSort("createdAt", "desc");
                }
              }}
              onApply={() => {}}
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
                  ...lifecycleOptions.customer.statuses.map((status) => ({
                    value: status,
                    label: status.replaceAll("_", " "),
                  })),
                ]}
                value={currentFilters.status ?? ""}
              />
            </DataTableHeaderMenuSection>

            <DataTableHeaderMenuSection title="Sub-status">
              <SubStatusSelector
                label="Sub-status"
                onChange={(value) => updateFilter("subStatus", value)}
                options={subStatusFilterOptions}
                value={currentFilters.subStatus ?? ""}
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
                options={[{ value: "status", label: "Lifecycle" }]}
                value="status"
              />
            </DataTableHeaderMenuSection>
          </div>
        </DataTableHeaderMenu>
      ),
      render: (customer) => (
        <>
          <div className="font-medium text-slate-900">
            {customer.status.replaceAll("_", " ")}
          </div>
          <div className="mt-1 text-slate-500">
            {customer.subStatus ?? "No sub-status"}
          </div>
        </>
      ),
    },
    {
      key: "industry",
      minWidth: 220,
      header: (
        <DataTableHeaderMenu
          label="Industry"
          hasFilter
          hasSort
          isActive={
            Boolean(currentFilters.industry) ||
            currentFilters.sortField === "industry"
          }
          title="Industry options"
          description="Filter by industry or sort this column."
          width={320}
          align="left"
          footer={
            <DataTableHeaderMenuActions
              onClear={() => {
                updateFilter("industry", "");
                if (currentFilters.sortField === "industry") {
                  updateSort("createdAt", "desc");
                }
              }}
              onApply={() => {}}
              applyLabel="Done"
            />
          }
        >
          <div className="space-y-4">
            <DataTableHeaderMenuSection title="Filter">
              <Select
                label="Industry"
                onChange={(value) => updateFilter("industry", value)}
                options={[
                  { value: "", label: "All industries" },
                  ...lifecycleOptions.industries,
                ]}
                value={currentFilters.industry ?? ""}
              />
            </DataTableHeaderMenuSection>

            <DataTableHeaderMenuSection title="Sort">
              <SortControl
                direction={
                  currentFilters.sortField === "industry"
                    ? currentFilters.sortDirection ?? "desc"
                    : "desc"
                }
                onChange={(next) => updateSort(next.value, next.direction)}
                options={[{ value: "industry", label: "Industry" }]}
                value="industry"
              />
            </DataTableHeaderMenuSection>
          </div>
        </DataTableHeaderMenu>
      ),
      render: (customer) => (
        <>
          <div>{customer.industry}</div>
          <div className="mt-1 text-xs text-slate-500">
            {customer.companySize}
          </div>
        </>
      ),
      cellClassName: "text-slate-600",
    },
    {
      key: "plan",
      minWidth: 220,
      header: (
        <DataTableHeaderMenu
          label="Plan"
          hasFilter
          isActive={Boolean(currentFilters.selectedPlanId)}
          title="Plan filter"
          description="Filter customers by selected plan."
          width={300}
          align="left"
          footer={
            <DataTableHeaderMenuActions
              onClear={() => updateFilter("selectedPlanId", "")}
              onApply={() => {}}
              applyLabel="Done"
            />
          }
        >
          <DataTableHeaderMenuSection title="Filter">
            <Select
              label="Plan"
              onChange={(value) => updateFilter("selectedPlanId", value)}
              options={[
                { value: "", label: "All plans" },
                ...plans.map((plan) => ({
                  value: plan.id,
                  label: plan.name,
                })),
              ]}
              value={currentFilters.selectedPlanId ?? ""}
            />
          </DataTableHeaderMenuSection>
        </DataTableHeaderMenu>
      ),
      render: (customer) => customer.selectedPlan?.name ?? "Not selected",
      cellClassName: "text-slate-600",
    },
    {
      key: "tenant",
      minWidth: 220,
      header: <span className="font-medium text-slate-600">Tenant</span>,
      render: (customer) =>
        customer.tenant ? (
          <>
            <Link
              href={`/tenants/${customer.tenant.id}`}
              className="font-medium text-slate-950 hover:text-slate-700"
            >
              {customer.tenant.name}
            </Link>
            <div className="mt-1 text-slate-500">
              {customer.tenant.status.replaceAll("_", " ")}
            </div>
          </>
        ) : (
          <span className="text-slate-500">No tenant</span>
        ),
      cellClassName: "text-slate-600",
    },
    {
      key: "actions",
      minWidth: 220,
      header: <span className="font-medium text-slate-600">Actions</span>,
      render: (customer) => (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/customers/${customer.id}`}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Open
          </Link>

          {customer.tenant ? (
            <Link
              href={`/tenants/${customer.tenant.id}`}
              className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700"
            >
              Tenant
            </Link>
          ) : (
            <Link
              href={`/onboarding/new?customerId=${customer.id}`}
              className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700"
            >
              Onboard
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <ModuleListLayout
      title="Customers"
      description="Manage qualified business accounts separately from leads and tenants, then move them into onboarding when the commercial path is ready."
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
                  onClick={() => router.push("/customers/new")}
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
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                  disabled={selectedIds.length === 0 || isPending}
                  onClick={handleBulkAssign}
                  type="button"
                >
                  <UserCheck className="h-4 w-4" />
                  <span>Assign</span>
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
              <h2 className="text-xl font-semibold text-slate-900">
                {entityLogicalName}
              </h2>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span>{viewDisplayName}</span>
              </div>
            </div>
          </div>
        </div>
      }
      pagination={
        <PaginationControl
          page={initialData.meta.page}
          totalPages={initialData.meta.totalPages}
        />
      }
    >
      <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Customer pipeline
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {initialData.meta.total} total customer
              {initialData.meta.total === 1 ? "" : "s"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {message ? <p className="text-sm text-slate-600">{message}</p> : null}

            <OwnerSelector
              label="Bulk owner"
              onChange={setBulkOwnerId}
              options={[
                { value: "", label: "Unassigned" },
                ...operators.map((operator) => ({
                  value: operator.id,
                  label: operator.fullName,
                })),
              ]}
              value={bulkOwnerId}
            />

            <button
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              onClick={() => setSelectedIds([])}
              type="button"
            >
              Clear selection
            </button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rowKey={(customer) => customer.id}
          rows={initialData.items}
          selectable
          selectedRowIds={selectedIds}
          onToggleAll={toggleAll}
          onToggleRow={toggleRow}
          stickyHeader
          zebra
          hoverable
          emptyTitle="No customers found"
          emptyDescription="Try changing the table filters or create a new customer."
        />
      </div>
    </ModuleListLayout>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}