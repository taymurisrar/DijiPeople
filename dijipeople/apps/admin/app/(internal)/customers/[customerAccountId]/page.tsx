import Link from "next/link";
import { CustomerDetailManager } from "@/app/_components/customer-detail-manager";
import type {
  CustomerRecord,
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerAccountId: string }>;
}) {
  const { customerAccountId } = await params;
  const [customer, lifecycleOptions, operators, plans] = await Promise.all([
    apiRequestJson<CustomerRecord & {
      notes?: Array<{ id: string; note: string; createdAt: string }>;
      onboardings?: Array<{ id: string; status: string; subStatus?: string | null; tenantCreated: boolean }>;
    }>(`/super-admin/customers/${customerAccountId}`),
    apiRequestJson<LifecycleOptions>("/super-admin/lifecycle-options"),
    apiRequestJson<OperatorOption[]>("/super-admin/operators"),
    apiRequestJson<PlanOption[]>("/super-admin/plans"),
  ]);

  return (
    <main className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <Link href="/customers" className="text-sm font-medium text-slate-600 hover:text-slate-950">
          Back to customers
        </Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Customer detail
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">{customer.companyName}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {(customer.primaryContactEmail ?? "No primary email")} • {customer.country} • {customer.status.replaceAll("_", " ")}
        </p>
      </section>

      <CustomerDetailManager
        customer={customer}
        lifecycleOptions={lifecycleOptions}
        operators={operators}
        plans={plans}
      />
    </main>
  );
}
