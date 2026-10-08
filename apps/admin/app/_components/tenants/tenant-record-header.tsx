"use client";

import { formatDate, formatEnumLabel } from "@/lib/formatters";
import type { RecordHeaderSecondaryItem } from "@/app/_components/runtime/record-highlight-header";

/*
 * The tenant record header's content, drawn by the shared `RecordHeader`.
 *
 * The eyebrow says TENANT because that is what the record is; showing the
 * navigation group made it read as a Customer, which is a different entity with
 * a different owner and a different lifecycle. Everything on the secondary line
 * is a business value — the customer is a name that links to its record, never
 * an id. This used to be a header component of its own; it is now only the
 * tenant-specific values, so a tenant reads in the same layout as every other
 * record.
 */

export function tenantHeaderTitle(record: Record<string, unknown>) {
  return String(record.displayName ?? record.name ?? "Tenant");
}

/**
 * Always rendered, including for PRODUCTION. A badge that only appears on
 * non-production makes "no badge" ambiguous — unlabelled and production look
 * identical — and this header sits above suspend, cancel and erase.
 */
export function TenantEnvironmentBadge({
  record,
}: {
  record: Record<string, unknown>;
}) {
  const environmentType =
    typeof record.environmentType === "string" ? record.environmentType : null;
  if (!environmentType) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        environmentType === "PRODUCTION"
          ? "bg-slate-100 text-slate-700"
          : "bg-amber-100 text-amber-900"
      }`}
    >
      {formatEnumLabel(environmentType)}
    </span>
  );
}

export function tenantHeaderSecondary(
  record: Record<string, unknown>,
): RecordHeaderSecondaryItem[] {
  const customer = asRecord(record.customerAccount);
  const subscription = asRecord(record.subscription);
  const plan = asRecord(subscription?.plan);
  const workspaceDomain =
    typeof record.primaryDomain === "string" ? record.primaryDomain : null;
  const createdAt =
    typeof record.createdAt === "string" ? record.createdAt : null;
  const items: Array<RecordHeaderSecondaryItem | null> = [
    customer?.id
      ? {
          label: "Customer",
          value: String(customer.companyName ?? "Open customer"),
          href: `/customers/${String(customer.id)}`,
        }
      : { label: "Customer", value: "Not linked" },
    workspaceDomain
      ? {
          label: "Workspace",
          value: workspaceDomain,
          href: `https://${workspaceDomain}`,
          external: true,
        }
      : { label: "Workspace", value: "Not provisioned" },
    plan?.name ? { label: "Plan", value: String(plan.name) } : null,
    subscription?.billingCycle
      ? {
          label: "Billing",
          value: formatEnumLabel(String(subscription.billingCycle)),
        }
      : null,
    record.tenantCode
      ? { label: "Tenant code", value: String(record.tenantCode) }
      : null,
    { label: "Created", value: formatDate(createdAt) },
  ];
  return items.filter(
    (item): item is RecordHeaderSecondaryItem => item !== null,
  );
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
