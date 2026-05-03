"use client";

import { DataTableToolbar } from "@/app/components/data-table/data-table-toolbar";
import { getUserFilterFields } from "./users-filters";

export function UsersFilterBar() {
  return (
    <DataTableToolbar
      fields={getUserFilterFields()}
      resetLabel="Reset filters"
      submitLabel="Apply filters"
    />
  );
}