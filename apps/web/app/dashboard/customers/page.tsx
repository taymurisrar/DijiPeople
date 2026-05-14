import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";

type CustomerRecord = {
  id: string;
  name: string;
  code: string;
  industry?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  status: string;
  _count?: { projects: number };
};

export default async function CustomersPage() {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include customer records."
          title="Customers are unavailable for your current business unit access."
        />
      </main>
    );
  }

  const customers = await apiRequestJson<CustomerRecord[]>("/customers");

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-surface p-8 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Customers
          </p>
          <h1 className="font-serif text-4xl text-foreground">
            Client accounts and project portfolios.
          </h1>
          <p className="max-w-3xl text-muted">
            Maintain tenant-scoped customers and connect each client to one or
            more delivery projects.
          </p>
        </div>
      </section>

      <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-strong text-left text-muted">
              <tr>
                <th className="px-5 py-4 font-medium">Customer</th>
                <th className="px-5 py-4 font-medium">Industry</th>
                <th className="px-5 py-4 font-medium">Contact</th>
                <th className="px-5 py-4 font-medium">Projects</th>
                <th className="px-5 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white/90">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-accent-soft/30">
                  <td className="px-5 py-4">
                    <Link
                      className="font-semibold text-foreground hover:text-accent"
                      href={`/dashboard/customers/${customer.id}`}
                    >
                      {customer.name}
                    </Link>
                    <p className="mt-1 text-muted">{customer.code}</p>
                  </td>
                  <td className="px-5 py-4 text-muted">
                    {customer.industry || "Not set"}
                  </td>
                  <td className="px-5 py-4 text-muted">
                    <p>{customer.contactName || "No contact"}</p>
                    <p>{customer.contactEmail || ""}</p>
                  </td>
                  <td className="px-5 py-4 text-muted">
                    {customer._count?.projects ?? 0}
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {customer.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
