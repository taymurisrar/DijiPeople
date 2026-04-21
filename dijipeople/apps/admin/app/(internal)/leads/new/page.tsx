import { LeadCreateManager } from "@/app/_components/lead-create-manager";
import type {
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

export default async function NewLeadPage() {
  const [lifecycleOptions, operators, plans] = await Promise.all([
    apiRequestJson<LifecycleOptions>("/super-admin/lifecycle-options"),
    apiRequestJson<OperatorOption[]>("/super-admin/operators"),
    apiRequestJson<PlanOption[]>("/super-admin/plans"),
  ]);

  return (
    <main className="space-y-4">
      <LeadCreateManager
        lifecycleOptions={lifecycleOptions}
        operators={operators}
        plans={plans}
      />
    </main>
  );
}