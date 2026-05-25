import { LeadCreateManager } from "@/app/_components/lead-create-manager";
import type {
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

export default async function NewLeadPage() {
  const [currentUser, lifecycleOptions, operators, plans] = await Promise.all([
    requireSystemAdminUser("/leads/new"),
    apiRequestJson<LifecycleOptions>("/super-admin/lifecycle-options"),
    apiRequestJson<OperatorOption[]>("/platform-users/owner-candidates"),
    apiRequestJson<PlanOption[]>("/super-admin/plans"),
  ]);

  return (
    <main className="space-y-4">
      <LeadCreateManager
        currentUser={currentUser}
        lifecycleOptions={lifecycleOptions}
        operators={operators}
        plans={plans}
      />
    </main>
  );
}
