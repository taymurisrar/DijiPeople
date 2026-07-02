"use client";

import Link from "next/link";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";

export type PayrollPreviewEmployee = {
  id: string;
  employeeId: string;
  employee: string;
  employeeCode: string;
  department: string;
  businessUnit: string;
  legalEntity: string;
  currencyCode: string;
  earnings: number;
  benefits: number;
  claims: number;
  reimbursements: number;
  loans: number;
  taxes: number;
  deductions: number;
  netSalary: number;
  lineItems: Array<{ id: string; category: string; label: string; amount: string; sourceType?: string | null }>;
};

export function PayrollPreviewTable({ employees }: { employees: PayrollPreviewEmployee[] }) {
  const money = (row: PayrollPreviewEmployee, value: number) => `${row.currencyCode} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const columns: DataTableColumn<PayrollPreviewEmployee>[] = [
    { key: "employee", header: "Employee", sortable: true, searchable: true, sortAccessor: (row) => row.employee, searchAccessor: (row) => `${row.employee} ${row.employeeCode}`, render: (row) => <Link className="font-semibold text-accent hover:underline" href={`/employees/${row.employeeId}`}>{row.employee}<span className="block text-xs font-normal text-muted">{row.employeeCode}</span></Link> },
    { key: "department", header: "Department", sortable: true, filterable: true, searchable: true, sortAccessor: (row) => row.department, filterAccessor: (row) => row.department, searchAccessor: (row) => row.department, render: (row) => row.department },
    { key: "businessUnit", header: "Business Unit", sortable: true, filterable: true, sortAccessor: (row) => row.businessUnit, filterAccessor: (row) => row.businessUnit, render: (row) => row.businessUnit },
    ...(["earnings", "benefits", "claims", "reimbursements", "loans", "taxes", "deductions", "netSalary"] as const).map((key): DataTableColumn<PayrollPreviewEmployee> => ({ key, header: key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()), sortable: true, sortAccessor: (row) => row[key], render: (row) => money(row, row[key]) })),
  ];
  return (
    <div className="grid gap-4">
      <DataTable columns={columns} rows={employees} getRowKey={(row) => row.id} />
      <div className="grid gap-3">
        {employees.map((employee) => (
          <details className="rounded-xl border border-border bg-surface p-4" key={employee.id}>
            <summary className="cursor-pointer font-semibold text-foreground">{employee.employee} line-item drill-down</summary>
            <div className="mt-3 grid gap-2 text-sm">
              {employee.lineItems.map((line) => <div className="flex justify-between gap-4 border-t border-border pt-2" key={line.id}><span>{line.category} / {line.sourceType ?? "Payroll"} / {line.label}</span><span>{employee.currencyCode} {line.amount}</span></div>)}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
