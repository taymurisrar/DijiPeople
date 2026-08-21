"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formatDate, formatEnumLabel } from "@/lib/formatters";

/**
 * The tenant record header.
 *
 * The eyebrow says TENANT because that is what the record is; showing the
 * navigation group made it read as a Customer, which is a different entity with
 * a different owner and a different lifecycle. Everything below the title is a
 * business value — the customer is a name that links to its record, never an id.
 *
 * Status and sub-status are no longer drawn here. They belong to the shared
 * record header status group, which every module now renders in the same
 * place; leaving a second copy beside the title meant a tenant showed its
 * state twice, in two different shapes.
 */
export function TenantRecordHeader({
  record,
  statusGroup,
}: {
  record: Record<string, unknown>;
  statusGroup?: ReactNode;
}) {
  const displayName = String(record.displayName ?? record.name ?? "Tenant");
  const customer = asRecord(record.customerAccount);
  const subscription = asRecord(record.subscription);
  const plan = asRecord(subscription?.plan);
  const workspaceDomain =
    typeof record.primaryDomain === "string" ? record.primaryDomain : null;
  const environmentType =
    typeof record.environmentType === "string" ? record.environmentType : null;
  const createdAt =
    typeof record.createdAt === "string" ? record.createdAt : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Tenant
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-950">
              {displayName}
            </h1>
            {environmentType ? (
              /*
               * Always rendered, including for PRODUCTION. A badge that only appears
               * on non-production makes "no badge" ambiguous — unlabelled and
               * production look identical — and this header sits above suspend,
               * cancel and erase.
               */
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  environmentType === "PRODUCTION"
                    ? "bg-slate-100 text-slate-700"
                    : "bg-amber-100 text-amber-900"
                }`}
              >
                {formatEnumLabel(environmentType)}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
            {plan?.name ? (
              <>
                <span className="font-medium text-slate-800">
                  {String(plan.name)}
                </span>
                <Dot />
              </>
            ) : null}
            {subscription?.billingCycle ? (
              <>
                <span>
                  {formatEnumLabel(String(subscription.billingCycle))}
                </span>
                <Dot />
              </>
            ) : null}
            <span>Created {formatDate(createdAt)}</span>
          </div>
        </div>
        {statusGroup ? <div className="shrink-0">{statusGroup}</div> : null}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div className="flex items-baseline gap-2">
          <dt className="text-slate-500">Customer</dt>
          <dd>
            {customer?.id ? (
              <Link
                href={`/customers/${String(customer.id)}`}
                className="font-semibold text-[var(--admin-primary)] hover:underline"
              >
                {String(customer.companyName ?? "Open customer")}
              </Link>
            ) : (
              <span className="text-slate-500">Not linked</span>
            )}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-slate-500">Workspace</dt>
          <dd>
            {workspaceDomain ? (
              <a
                href={`https://${workspaceDomain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[var(--admin-primary)] hover:underline"
              >
                {workspaceDomain}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ) : (
              <span className="text-slate-500">Not provisioned</span>
            )}
          </dd>
        </div>
        {record.tenantCode ? (
          <div className="flex items-baseline gap-2">
            <dt className="text-slate-500">Tenant code</dt>
            <dd className="font-medium text-slate-800">
              {String(record.tenantCode)}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function Dot() {
  return <span aria-hidden>•</span>;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
