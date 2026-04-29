import { apiRequestJson } from "@/lib/server-api";
import { hasPermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";
import { PayrollPeriodRecord, PayrollRunRecord } from "../payroll-run-types";
import { PayrollRunsManager } from "./_components/payroll-runs-manager";

export default async function PayrollRunsPage() {
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.PAYROLL_RUNS_READ)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to payroll runs."
      />
    );
  }
  const [periods, runs] = await Promise.all([
    apiRequestJson<PayrollPeriodRecord[]>("/payroll/periods"),
    apiRequestJson<PayrollRunRecord[]>("/payroll/runs"),
  ]);
  return (
    <PayrollLayoutShell
      title="Payroll Runs"
      description="Create, calculate, review, and lock compensation-based payroll runs."
    >
      <PayrollRunsManager
        periods={periods}
        runs={runs}
        canCreate={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.PAYROLL_RUNS_CREATE,
        )}
      />
    </PayrollLayoutShell>
  );
}
