import { notFound } from "next/navigation";
import { LeadDetailManager } from "@/app/_components/lead-detail-manager";
import type {
  LeadRecord,
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;

  if (!isUuid(leadId)) {
    notFound();
  }

  const [lead, lifecycleOptions, operators, plans] = await Promise.all([
    apiRequestJson<LeadRecord>(`/super-admin/leads/${leadId}`),
    apiRequestJson<LifecycleOptions>("/super-admin/lifecycle-options"),
    apiRequestJson<OperatorOption[]>("/super-admin/operators"),
    apiRequestJson<PlanOption[]>("/super-admin/plans"),
  ]);

  return (
    <main className="space-y-4">
      <LeadDetailManager
        lead={lead}
        lifecycleOptions={lifecycleOptions}
        operators={operators}
        plans={plans}
      />
    </main>
  );
}