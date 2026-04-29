"use client";

import {
    Check,
    ChevronDown,
    Filter,
    RotateCcw,
    Search,
    X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
    DataTableColumn,
    DataTableFilterOperator,
    DataTableFilterState,
} from "./types";

type DataTableFilterMenuProps<T> = {
    columns: DataTableColumn<T>[];
    filters: DataTableFilterState[];
    onFiltersChange: (filters: DataTableFilterState[]) => void;
};

const operators: { label: string; value: DataTableFilterOperator }[] = [
    { label: "Contains", value: "contains" },
    { label: "Equals", value: "equals" },
    { label: "Starts with", value: "startsWith" },
    { label: "Ends with", value: "endsWith" },
    { label: "Is empty", value: "isEmpty" },
    { label: "Is not empty", value: "isNotEmpty" },
];

export function DataTableFilterMenu<T>({
    columns,
    filters,
    onFiltersChange,
}: DataTableFilterMenuProps<T>) {
    const filterableColumns = useMemo(
        () =>
            columns.filter(
                (column) => column.filterable && column.filterAccessor,
            ),
        [columns],
    );

    const [open, setOpen] = useState(false);
    const [columnKey, setColumnKey] = useState(filterableColumns[0]?.key ?? "");
    const [operator, setOperator] =
        useState<DataTableFilterOperator>("contains");
    const [value, setValue] = useState("");

    const selectedOperatorNeedsValue =
        operator !== "isEmpty" && operator !== "isNotEmpty";

    function addFilter() {
        if (!columnKey) return;

        if (selectedOperatorNeedsValue && !value.trim()) {
            return;
        }

        const nextFilter: DataTableFilterState = {
            columnKey,
            operator,
            value: selectedOperatorNeedsValue ? value.trim() : "",
        };

        onFiltersChange([
            ...filters.filter((filter) => filter.columnKey !== columnKey),
            nextFilter,
        ]);

        setValue("");
    }

    function removeFilter(columnKeyToRemove: string) {
        onFiltersChange(
            filters.filter((filter) => filter.columnKey !== columnKeyToRemove),
        );
    }

    function getColumnLabel(key: string) {
        const column = columns.find((item) => item.key === key);
        return typeof column?.header === "string" ? column.header : key;
    }

    function getOperatorLabel(value: DataTableFilterOperator) {
        return operators.find((item) => item.value === value)?.label ?? value;
    }

    if (!filterableColumns.length) {
        return null;
    }

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-surface-strong"
            >
                <Filter className="h-4 w-4" />
                Filter
                {filters.length > 0 ? (
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-xs text-white">
                        {filters.length}
                    </span>
                ) : null}
                <ChevronDown className="h-4 w-4 text-muted" />
            </button>

            {open ? (
                <div className="absolute right-0 z-30 mt-2 w-[360px] overflow-hidden rounded-2xl border border-border bg-white shadow-xl">
                    <div className="border-b border-border bg-surface-strong px-4 py-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-foreground">
                                    Advanced Filter
                                </p>
                                <p className="text-xs text-muted">
                                    D365-style column filtering
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-lg p-1.5 text-muted transition hover:bg-white hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3 p-4">
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted">
                                Column
                            </span>
                            <select
                                value={columnKey}
                                onChange={(event) => setColumnKey(event.target.value)}
                                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground"
                            >
                                {filterableColumns.map((column) => (
                                    <option key={column.key} value={column.key}>
                                        {typeof column.header === "string"
                                            ? column.header
                                            : column.key}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-muted">
                                Operator
                            </span>
                            <select
                                value={operator}
                                onChange={(event) =>
                                    setOperator(event.target.value as DataTableFilterOperator)
                                }
                                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground"
                            >
                                {operators.map((item) => (
                                    <option key={item.value} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {selectedOperatorNeedsValue ? (
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-muted">
                                    Value
                                </span>
                                <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 focus-within:border-foreground">
                                    <Search className="h-4 w-4 text-muted" />
                                    <input
                                        value={value}
                                        onChange={(event) => setValue(event.target.value)}
                                        placeholder="Enter filter value"
                                        className="w-full bg-transparent text-sm outline-none"
                                    />
                                </div>
                            </label>
                        ) : null}

                        <button
                            type="button"
                            onClick={addFilter}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            <Check className="h-4 w-4" />
                            Apply filter
                        </button>
                    </div>

                    {filters.length > 0 ? (
                        <div className="border-t border-border bg-surface-strong p-4">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                    Active filters
                                </p>

                                <button
                                    type="button"
                                    onClick={() => onFiltersChange([])}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Clear all
                                </button>
                            </div>

                            <div className="space-y-2">
                                {filters.map((filter) => (
                                    <div
                                        key={filter.columnKey}
                                        className="flex items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs"
                                    >
                                        <span className="min-w-0 truncate">
                                            <strong>{getColumnLabel(filter.columnKey)}</strong>{" "}
                                            {getOperatorLabel(filter.operator)}
                                            {filter.value ? ` "${filter.value}"` : ""}
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() => removeFilter(filter.columnKey)}
                                            className="text-muted hover:text-foreground"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}