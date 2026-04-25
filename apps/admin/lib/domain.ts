export type BillingCycleValue =
  | "MONTHLY"
  | "ANNUAL"
  | "Monthly"
  | "Annual";

export type SubscriptionStatusValue =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED"
  | "Trialing"
  | "Active"
  | "Past_Due"
  | "Cancelled";

export type TenantStatusValue =
  | "ONBOARDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "CHURNED"
  | "Onboarding"
  | "Active"
  | "Suspended"
  | "Churned";

export function toCanonicalEnumValue(value: string): string {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

export type TenantSubscriptionSummary = {
  id: string;
  plan: {
    id: string;
    key: string;
    name: string;
  };
  status: SubscriptionStatusValue | string;
  billingCycle: BillingCycleValue | string;
  finalPrice: number;
  currency: string;
  startDate?: string;
  endDate?: string | null;
  renewalDate?: string | null;
};
