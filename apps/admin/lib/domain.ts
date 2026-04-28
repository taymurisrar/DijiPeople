export type BillingCycleValue = "MONTHLY" | "ANNUAL";

export type SubscriptionStatusValue =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED";

export type TenantStatusValue =
  | "ONBOARDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "CHURNED";

export function toCanonicalEnumValue(value: string): string {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

export function toBillingCycle(value: string): BillingCycleValue {
  const normalized = toCanonicalEnumValue(value);

  if (normalized === "MONTHLY" || normalized === "ANNUAL") {
    return normalized;
  }

  throw new Error(`Invalid BillingCycleValue: ${value}`);
}

export function toSubscriptionStatus(
  value: string,
): SubscriptionStatusValue {
  const normalized = toCanonicalEnumValue(value);

  if (
    normalized === "TRIALING" ||
    normalized === "ACTIVE" ||
    normalized === "PAST_DUE" ||
    normalized === "CANCELLED"
  ) {
    return normalized;
  }

  throw new Error(`Invalid SubscriptionStatusValue: ${value}`);
}

export function toTenantStatus(value: string): TenantStatusValue {
  const normalized = toCanonicalEnumValue(value);

  if (
    normalized === "ONBOARDING" ||
    normalized === "ACTIVE" ||
    normalized === "SUSPENDED" ||
    normalized === "CHURNED"
  ) {
    return normalized;
  }

  throw new Error(`Invalid TenantStatusValue: ${value}`);
}

export const BillingCycleLabels: Record<BillingCycleValue, string> = {
  MONTHLY: "Monthly",
  ANNUAL: "Annual",
};

export const SubscriptionStatusLabels: Record<
  SubscriptionStatusValue,
  string
> = {
  TRIALING: "Trialing",
  ACTIVE: "Active",
  PAST_DUE: "Past Due",
  CANCELLED: "Cancelled",
};

export const TenantStatusLabels: Record<TenantStatusValue, string> = {
  ONBOARDING: "Onboarding",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  CHURNED: "Churned",
};

export type TenantSubscriptionSummary = {
  id: string;
  plan: {
    id: string;
    key: string;
    name: string;
  };
  status: SubscriptionStatusValue;
  billingCycle: BillingCycleValue;
  finalPrice: number;
  currency: string;
  startDate?: string;
  endDate?: string | null;
  renewalDate?: string | null;
};