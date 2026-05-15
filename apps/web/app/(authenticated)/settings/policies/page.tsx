import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import {
  PoliciesManager,
  PolicyAssignmentRecord,
  PolicyRecord,
} from "./_components/policies-manager";

export default async function PoliciesPage() {
  await requireSettingsPermissions([
    PERMISSION_KEYS.POLICIES_READ,
    PERMISSION_KEYS.POLICIES_MANAGE,
  ]);

  const [policies, assignments] = await Promise.all([
    apiRequestJson<PolicyRecord[]>("/policies"),
    apiRequestJson<PolicyAssignmentRecord[]>("/policies/assignments"),
  ]);

  return (
    <SettingsShell
      description="Reusable effective-dated policies and assignments for payroll, leave, claims, TA/DA, tax, and future modules."
      eyebrow="Policy Settings"
      title="Policies"
    >
      <PoliciesManager assignments={assignments} policies={policies} />
    </SettingsShell>
  );
}
