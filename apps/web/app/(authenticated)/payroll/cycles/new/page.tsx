import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollCycleRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";
import type { TenantResolvedSettingsResponse } from "@/app/(authenticated)/settings/types";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

type EmployerBankAccount = {
  id?: string | null;
  accountPurpose?: string | null;
  isActive?: boolean | null;
  isDefaultPayrollAccount?: boolean | null;
};

export default async function NewPayrollCyclePage({ searchParams }: Props) {
  const [user, params, settings, bankAccountsResponse] = await Promise.all([
    getSessionUser(),
    searchParams,
    apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved"),
    apiRequestJson<unknown>("/payroll/employer-bank-accounts?pageSize=100"),
  ]);
  const runtime = buildStandardRouteRuntime({
    pageKind: "create",
    sessionUser: user,
    spec: payrollCycleRuntimeSpec,
  });
  const formId = first(params?.formId);
  const employerBankAccounts = readEmployerBankAccounts(bankAccountsResponse);
  const defaultEmployerBankAccountId =
    employerBankAccounts.find(
      (account) =>
        account.id &&
        account.isActive !== false &&
        account.accountPurpose === "PAYROLL" &&
        account.isDefaultPayrollAccount,
    )?.id ??
    employerBankAccounts.find(
      (account) =>
        account.id &&
        account.isActive !== false &&
        account.accountPurpose === "PAYROLL",
    )?.id ??
    "";

  return (
    <PayrollLayoutShell
      title="New Payroll Cycle"
      description="Create a reusable cycle definition for payroll scheduling and generation defaults."
    >
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(
          runtime.metadata.forms,
          formId,
          "main",
        )}
        mode="create"
        record={{
          name: "",
          code: "",
          payFrequency: "MONTHLY",
          currencyCode: settings.payroll.defaultCurrency,
          payrollRegionId: settings.payroll.defaultPayrollRegionId,
          payrollCalendarId: settings.payroll.defaultPayrollCalendarId,
          adjustDatesForWeekend: false,
          adjustDatesForHoliday: false,
          isDefault: false,
          defaultGenerationSource: settings.payroll.payrollGenerationSource,
          defaultEmployerBankAccountId,
        }}
        runtime={runtime}
        spec={payrollCycleRuntimeSpec}
        title="New Payroll Cycle"
      />
    </PayrollLayoutShell>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readEmployerBankAccounts(value: unknown): EmployerBankAccount[] {
  if (Array.isArray(value)) return value.filter(isEmployerBankAccount);
  if (!value || typeof value !== "object") return [];

  const record = value as {
    items?: unknown;
    data?: unknown;
    records?: unknown;
    results?: unknown;
  };

  for (const child of [record.items, record.records, record.results]) {
    if (Array.isArray(child)) return child.filter(isEmployerBankAccount);
  }

  return readEmployerBankAccounts(record.data);
}

function isEmployerBankAccount(value: unknown): value is EmployerBankAccount {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
