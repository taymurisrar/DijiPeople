import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { ProjectStatusBadge } from "../../projects/_components/project-status-badge";
import type { ProjectStatus } from "../../projects/types";

type CustomerDetail = {
  id: string;
  name: string;
  code: string;
  industry?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  billingEmail?: string | null;
  websiteUrl?: string | null;
  address?: string | null;
  status: string;
  projects: Array<{
    id: string;
    name: string;
    code?: string | null;
    status: ProjectStatus;
    timezone?: string | null;
    currencyCode?: string | null;
  }>;
};

type PageProps = {
  params: Promise<{ customerId: string }>;
};

export default async function CustomerDetailPage({ params }: PageProps) {
  const { customerId } = await params;
  const customer = await apiRequestJson<CustomerDetail>(
    `/customers/${customerId}`,
  );

  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Customer
        </p>
        <h1 className="mt-2 font-serif text-4xl text-foreground">
          {customer.name}
        </h1>
        <p className="mt-2 text-muted">{customer.code}</p>
      </section>

      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-3">
        <Detail label="Industry" value={customer.industry} />
        <Detail label="Status" value={customer.status} />
        <Detail label="Primary contact" value={customer.contactName} />
        <Detail label="Contact email" value={customer.contactEmail} />
        <Detail label="Contact phone" value={customer.contactPhone} />
        <Detail label="Billing email" value={customer.billingEmail} />
      </section>

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Related projects
          </h2>
        </div>

        <div className="divide-y divide-border">
          {customer.projects.map((project) => (
            <div
              key={project.id}
              className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  className="font-semibold text-foreground hover:text-accent"
                >
                  {project.name}
                </Link>
                <p className="mt-1 text-sm text-muted">
                  {[project.code, project.timezone, project.currencyCode]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <ProjectStatusBadge status={project.status} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">
        {value || "Not set"}
      </p>
    </div>
  );
}
