"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTablePagination } from "@/app/components/data-table/data-table-pagination";
import {
    DataTableColumn,
    DataTableFilterState,
} from "@/app/components/data-table/types";
import { formatDateWithTenantSettings } from "@/lib/date-format";
import { ProjectRecord } from "../types";
import { ProjectStatusBadge } from "./project-status-badge";

type ProjectsTableProps = {
    requests: ProjectRecord[];
    formatting: {
        dateFormat: string;
        locale: string;
        timezone: string;
    };
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        pathname: string;
        searchParams: Record<string, string | undefined>;
    };
    visibleColumnKeys?: string[];
    initialSortColumnKey?: string;
    initialSortDirection?: "asc" | "desc";
    initialFilters?: DataTableFilterState[];
    enableSelection?: boolean;
    useEntityDataApi?: boolean;
};

export function ProjectsTable({
    requests,
    formatting,
    pagination,
    visibleColumnKeys,
    initialSortColumnKey = "name",
    initialSortDirection = "asc",
    initialFilters = [],
    enableSelection = false,
    useEntityDataApi = false,
}: ProjectsTableProps) {
    const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

    useEffect(() => {
        window.dispatchEvent(
            new CustomEvent("projects:selected-ids-changed", {
                detail: {
                    ids: selectedProjectIds,
                    count: selectedProjectIds.length,
                },
            }),
        );
    }, [selectedProjectIds]);

    useEffect(() => {
        function clearSelection() {
            setSelectedProjectIds([]);
        }

        window.addEventListener("projects:clear-selection", clearSelection);
        return () =>
            window.removeEventListener("projects:clear-selection", clearSelection);
    }, []);

    const columns: DataTableColumn<ProjectRecord>[] = [
        {
            key: "name",
            entityField: "name",
            header: "Project",
            sortable: true,
            filterable: true,
            filterType: "text",
            filterParamKey: "name",
            sortAccessor: (project) => project.name,
            filterAccessor: (project) => `${project.name} ${project.code ?? ""}`,
            render: (project) => (
                <div>
                    <Link
                        className="font-semibold text-foreground transition hover:text-accent"
                        href={`/projects/${project.id}`}
                    >
                        {project.name}
                    </Link>
                    <p className="mt-1 text-muted">{project.code || "No code"}</p>
                </div>
            ),
        },
        {
            key: "code",
            entityField: "code",
            header: "Code",
            sortable: true,
            filterable: true,
            filterType: "text",
            filterParamKey: "code",
            sortAccessor: (project) => project.code ?? "",
            filterAccessor: (project) => project.code ?? "",
            cellClassName: "text-muted",
            render: (project) => project.code || "No code",
        },
        {
            key: "status",
            entityField: "status",
            header: "Status",
            sortable: true,
            filterable: true,
            filterType: "multiSelect",
            filterParamKey: "status",
            filterOptions: [
                { label: "Draft", value: "DRAFT" },
                { label: "Planning", value: "PLANNING" },
                { label: "Active", value: "ACTIVE" },
                { label: "On Hold", value: "ON_HOLD" },
                { label: "Completed", value: "COMPLETED" },
                { label: "Closed", value: "CLOSED" },
                { label: "Cancelled", value: "CANCELLED" },
            ],
            sortAccessor: (project) => project.status,
            filterAccessor: (project) => project.status,
            render: (project) => <ProjectStatusBadge status={project.status} />,
        },
        {
            key: "customer",
            entityField: "customerId",
            header: "Customer",
            sortable: true,
            filterable: true,
            filterType: "text",
            filterParamKey: "customer",
            sortAccessor: (project) => project.customer?.name ?? "",
            filterAccessor: (project) => project.customer?.name ?? "",
            cellClassName: "text-muted",
            render: (project) => project.customer?.name ?? "No customer",
        },
        {
            key: "dateRange",
            entityField: "startDate",
            header: "Dates",
            sortable: true,
            filterable: true,
            filterType: "date",
            filterParamKey: "dateRange",
            sortAccessor: (project) =>
                project.startDate ? new Date(project.startDate).getTime() : 0,
            filterAccessor: (project) => project.startDate ?? "",
            cellClassName: "text-muted",
            render: (project) => (
                <div>
                    <p>
                        {project.startDate
                            ? formatDateWithTenantSettings(project.startDate, {
                                ...formatting,
                                timezone: project.timezone ?? formatting.timezone,
                            })
                            : "No start date"}
                    </p>
                    <p className="mt-1">
                        {project.endDate
                            ? formatDateWithTenantSettings(project.endDate, {
                                ...formatting,
                                timezone: project.timezone ?? formatting.timezone,
                            })
                            : "No end date"}
                    </p>
                </div>
            ),
        },
        {
            key: "assignedEmployees",
            entityField: "assignedEmployees",
            header: "Assigned",
            sortable: true,
            filterable: true,
            filterType: "text",
            filterParamKey: "assignedEmployees",
            sortAccessor: (project) => project.assignedEmployees?.length ?? 0,
            filterAccessor: (project) =>
                project.assignedEmployees
                    ?.map((assignment) => assignment.employee?.fullName ?? "")
                    .join(" ") ?? "",
            cellClassName: "text-muted",
            render: (project) => {
                const assignments = project.assignedEmployees ?? [];
                const visibleEmployees = assignments.slice(0, 2);

                return assignments.length > 0 ? (
                    <div>
                        <p>{assignments.length} employee(s)</p>
                        <p className="mt-1 max-w-xs truncate">
                            {visibleEmployees
                                .map((assignment) => assignment.employee?.fullName)
                                .filter(Boolean)
                                .join(", ")}
                            {assignments.length > visibleEmployees.length ? " +" : ""}
                        </p>
                    </div>
                ) : (
                    "No employees assigned"
                );
            },
        },
        {
            key: "actions",
            header: "Actions",
            sortable: false,
            filterable: false,
            render: (project) => (
                <Link
                    className="text-sm font-semibold text-accent transition hover:text-accent-strong"
                    href={`/projects/${project.id}`}
                >
                    Open
                </Link>
            ),
        },
    ];

    const visibleColumns = visibleColumnKeys?.length
        ? columns.filter((column) =>
            getProjectCustomizationColumnKeys(column.key).some((columnKey) =>
                visibleColumnKeys.includes(columnKey),
            ),
        )
        : columns;

    return (
        <section className="grid gap-6">
            <DataTable
                mode={useEntityDataApi ? "server" : "client"}
                entityLogicalName={useEntityDataApi ? "projects" : undefined}
                rows={requests}
                columns={visibleColumns.length ? visibleColumns : columns}
                getRowKey={(project) => project.id}
                initialSort={{
                    columnKey: initialSortColumnKey,
                    direction: initialSortDirection,
                }}
                initialFilters={initialFilters}
                pagination={{
                    page: pagination.page,
                    pageSize: pagination.pageSize,
                    totalItems: pagination.totalItems,
                }}
                footer={<DataTablePagination {...pagination} />}
                enableSelection={enableSelection}
                selectedRowKeys={selectedProjectIds}
                onSelectedRowKeysChange={setSelectedProjectIds}
            />
        </section>
    );
}

function getProjectCustomizationColumnKeys(tableColumnKey: string) {
    const map: Record<string, string[]> = {
        name: ["name", "project", "projectName"],
        code: ["code", "projectCode"],
        status: ["status"],
        customer: ["customer", "customerId", "customerName"],
        dateRange: ["startDate", "endDate", "timezone"],
        assignedEmployees: ["assignedEmployees", "employees", "employeeAssignments"],
        actions: ["actions"],
    };

    return map[tableColumnKey] ?? [tableColumnKey];
}