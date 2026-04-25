import { notFound } from "next/navigation";
import { CustomerDetailManager } from "@/app/_components/customer-detail-manager";
import type {
  CustomerRecord,
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

type CustomerDetailRecord = CustomerRecord & {
  notes?: Array<{
    id: string;
    note: string;
    createdAt: string;
  }>;
  onboardings?: Array<{
    id: string;
    status: string;
    subStatus?: string | null;
    tenantCreated: boolean;
  }>;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerAccountId: string }>;
}) {
  const { customerAccountId } = await params;

  if (!isUuid(customerAccountId)) {
    notFound();
  }

  const [customer, lifecycleOptions, operators, plans] = await Promise.all([
    apiRequestJson<CustomerDetailRecord>(
      `/super-admin/customers/${customerAccountId}`,
    ),
    apiRequestJson<LifecycleOptions>("/super-admin/lifecycle-options"),
    apiRequestJson<OperatorOption[]>("/super-admin/operators"),
    apiRequestJson<PlanOption[]>("/super-admin/plans"),
  ]);

  return (
    <main className="space-y-4">
      <CustomerDetailManager
        customer={customer}
        lifecycleOptions={lifecycleOptions}
        operators={operators}
        plans={plans}
      />
    </main>
  );
}