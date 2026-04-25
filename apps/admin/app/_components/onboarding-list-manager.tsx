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
  CustomerOnboardingRecord,
  LifecycleOptions,
  OperatorOption,
  PaginatedResponse,
} from "./platform-lifecycle-types";

type OnboardingListManagerProps = {
  initialData: PaginatedResponse<CustomerOnboardingRecord>;
  lifecycleOptions: LifecycleOptions;
  operators: OperatorOption[];
  currentFilters: {
    status?: string;
    subStatus?: string;
    customerId?: string;
    onboardingOwnerUserId?: string;
    search?: string;
    sortField?: string;
    sortDirection?: string;
  };
};

type TableColumn = {
  key: string;
  header: React.ReactNode;
  render: (
    onboarding: CustomerOnboardingRecord,
    index: number,
  ) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  minWidth?: string | number;
  width?: string | number;
  align?: "left" | "center" | "right";
};

export function OnboardingListManager({
  initialData,
  lifecycleOptions,
  operators,
  currentFilters,
}: OnboardingListManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [bulkOwnerId, setBulkOwnerId] = useState("");

  const entityLogicalName = "Onboarding";
  const viewDisplayName = "Default view";

  const onboardingLifecycle =
    lifecycleOptions.customerOnboarding ?? lifecycleOptions.onboarding;

  const subStatusFilterOptions = useMemo(() => {
    const allSubStatuses = Object.values(onboardingLifecycle.subStatuses).flat();

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
  }, [onboardingLifecycle.subStatuses]);

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
      `/onboarding${search.toString() ? `?${search.toString()}` : ""}`,
    );
  }

  function updateSort(field: string, direction: string) {
    const search = new URLSearchParams(window.location.search);

    search.set("sortField", field);
    search.set("sortDirection", direction);
    search.delete("page");

    router.push(`/onboarding?${search.toString()}`);
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
      `Delete ${selectedIds.length} selected onboarding record${
        selectedIds.length === 1 ? "" : "s"
      }?`,
    );

    if (!confirmed) return;

    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/super-admin/customer-onboarding", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to delete onboarding records.");
        return;
      }

      setSelectedIds([]);
      setMessage("Selected onboarding records deleted.");
      router.refresh();
    });
  }

  function handleBulkAssign() {
    if (selectedIds.length === 0) return;

    setMessage(null);

    startTransition(async () => {
      const response = await fetch(
        "/api/super-admin/customer-onboarding/bulk/assign",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: selectedIds,
            onboardingOwnerUserId: bulkOwnerId || undefined,
          }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(
          payload?.message ?? "Unable to assign selected onboarding records.",
        );
        return;
      }

      setSelectedIds([]);
      setBulkOwnerId("");
      setMessage("Selected onboarding records updated.");
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
          title="Search onboarding"
          description="Search by customer, contact, owner, or email."
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
              placeholder="Search customer, contact, owner, or email"
            />
          </DataTableHeaderMenuSection>
        </DataTableHeaderMenu>
      ),
      render: (item) => (
        <>
          <Link
            href={`/onboarding/${item.id}`}
            className="font-medium text-slate-950 hover:text-slate-700"
          >
            {item.customer.companyName}
          </Link>
          <div className="mt-1 text-slate-500">
            {[
              item.customer.primaryContactFirstName,
              item.customer.primaryContactLastName,
            ]
              .filter(Boolean)
              .join(" ") || "No primary contact"}
          </div>
          <div className="mt-1 text-slate-500">
            {item.customer.primaryContactEmail ?? "No email"}
          </div>
        </>
      ),
    },
    {
      key: "owner",
      minWidth: 220,
      header: (
        <DataTableHeaderMenu
          label="Owner"
          hasFilter
          hasSort
          isActive={
            Boolean(currentFilters.onboardingOwnerUserId) ||
            currentFilters.sortField === "owner"
          }
          title="Owner options"
          description="Filter by onboarding owner or sort this column."
          width={320}
          align="left"
          footer={
            <DataTableHeaderMenuActions
              onClear={() => {
                updateFilter("onboardingOwnerUserId", "");
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
                label="Owner"
                onChange={(value) =>
                  updateFilter("onboardingOwnerUserId", value)
                }
                options={[
                  { value: "", label: "All owners" },
                  ...operators.map((operator) => ({
                    value: operator.id,
                    label: operator.fullName,
                  })),
                ]}
                value={currentFilters.onboardingOwnerUserId ?? ""}
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
                options={[{ value: "owner", label: "Owner" }]}
                value="owner"
              />
            </DataTableHeaderMenuSection>
          </div>
        </DataTableHeaderMenu>
      ),
      render: (item) =>
        item.onboardingOwnerUser
          ? `${item.onboardingOwnerUser.firstName} ${item.onboardingOwnerUser.lastName}`
          : "Unassigned",
      cellClassName: "text-slate-600",
    },
    {
      key: "status",
      minWidth: 240,
      header: (
        <DataTableHeaderMenu
          label="Status"
          hasFilter
          hasSort
          isActive={
            Boolean(currentFilters.status) ||
            Boolean(currentFilters.subStatus) ||
            currentFilters.sortField === "status"
          }
          title="Status options"
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
                  ...onboardingLifecycle.statuses.map((status) => ({
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
                options={[{ value: "status", label: "Status" }]}
                value="status"
              />
            </DataTableHeaderMenuSection>
          </div>
        </DataTableHeaderMenu>
      ),
      render: (item) => (
        <>
          <div className="font-medium text-slate-900">
            {item.status.replaceAll("_", " ")}
          </div>
          <div className="mt-1 text-slate-500">
            {item.subStatus ?? "No sub-status"}
          </div>
        </>
      ),
    },
    {
      key: "readiness",
      minWidth: 220,
      header: (
        <DataTableHeaderMenu
          label="Readiness"
          hasSort
          isActive={currentFilters.sortField === "readiness"}
          title="Readiness options"
          description="Sort records by onboarding readiness."
          width={280}
          align="left"
          footer={
            <DataTableHeaderMenuActions
              onClear={() => updateSort("createdAt", "desc")}
              onApply={() => {}}
              applyLabel="Done"
            />
          }
        >
          <DataTableHeaderMenuSection title="Sort">
            <SortControl
              direction={
                currentFilters.sortField === "readiness"
                  ? currentFilters.sortDirection ?? "desc"
                  : "desc"
              }
              onChange={(next) => updateSort(next.value, next.direction)}
              options={[{ value: "readiness", label: "Readiness" }]}
              value="readiness"
            />
          </DataTableHeaderMenuSection>
        </DataTableHeaderMenu>
      ),
      render: (item) => (
        <>
          <div className="font-medium text-slate-900">
            {item.readiness.completionPercent}%
          </div>
          <div className="mt-1 text-slate-500">
            {item.readiness.isReadyForTenantCreation
              ? "Ready for tenant"
              : `${item.readiness.blockers.length} blocker${
                  item.readiness.blockers.length === 1 ? "" : "s"
                }`}
          </div>
        </>
      ),
      cellClassName: "text-slate-600",
    },
    {
      key: "tenant",
      minWidth: 220,
      header: <span className="font-medium text-slate-600">Tenant</span>,
      render: (item) =>
        item.tenant ? (
          <>
            <Link
              href={`/tenants/${item.tenant.id}`}
              className="font-medium text-slate-950 hover:text-slate-700"
            >
              {item.tenant.name}
            </Link>
            <div className="mt-1 text-slate-500">
              {item.tenant.status.replaceAll("_", " ")}
            </div>
          </>
        ) : (
          <span className="text-slate-500">Not created</span>
        ),
      cellClassName: "text-slate-600",
    },
    {
      key: "actions",
      minWidth: 180,
      header: <span className="font-medium text-slate-600">Actions</span>,
      render: (item) => (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/onboarding/${item.id}`}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Open
          </Link>

          {item.tenant ? (
            <Link
              href={`/tenants/${item.tenant.id}`}
              className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700"
            >
              Tenant
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <ModuleListLayout
      title="Onboarding"
      description="Move approved customers through readiness, confirm setup milestones, and create tenants only when onboarding is complete."
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
                  onClick={() => router.push("/onboarding/new")}
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
          page={initialData.meta.page}
          totalPages={initialData.meta.totalPages}
        />
      }
    >
      <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Onboarding pipeline
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {initialData.meta.total} total onboarding record
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
          rowKey={(item) => item.id}
          rows={initialData.items}
          selectable
          selectedRowIds={selectedIds}
          onToggleAll={toggleAll}
          onToggleRow={toggleRow}
          stickyHeader
          zebra
          hoverable
          emptyTitle="No onboarding records found"
          emptyDescription="Try changing the table filters or create a new onboarding record."
        />
      </div>
    </ModuleListLayout>
  );
}
