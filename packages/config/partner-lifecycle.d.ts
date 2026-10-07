/**
 * Partner lifecycle (ADR-0026): status phases, labels, the governed actions
 * and the account-status explanations, shared by the API and the admin app.
 */
export type PartnerPhase =
  | "PROSPECT"
  | "ONBOARDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "CLOSED";

export type PartnerStatusValue =
  | "DRAFT"
  | "INQUIRY"
  | "NEW_INQUIRY"
  | "UNDER_REVIEW"
  | "MORE_INFORMATION_REQUIRED"
  | "QUALIFIED"
  | "APPROVED_AWAITING_AGREEMENT"
  | "AGREEMENT_DRAFTING"
  | "INTERNAL_APPROVAL"
  | "AGREEMENT_IN_PROGRESS"
  | "AWAITING_SIGNATURE"
  | "FULLY_SIGNED"
  | "AGREEMENT_EXECUTED"
  | "ONBOARDING_PENDING"
  | "ONBOARDING_INVITED"
  | "ONBOARDING_IN_PROGRESS"
  | "SUBMITTED"
  | "INFORMATION_APPROVED"
  | "APPROVED_FOR_ACTIVATION"
  | "ACTIVE"
  | "SUSPENDED"
  | "INACTIVE"
  | "TERMINATED"
  | "REJECTED";

export type PartnerAccountStatusValue =
  | "NOT_PROVISIONED"
  | "INVITED"
  | "ACTIVE"
  | "SUSPENDED"
  | "DISABLED";

export type PartnerLifecycleActionKey =
  | "start-review"
  | "approve"
  | "reject"
  | "request-information"
  | "activate"
  | "suspend"
  | "reactivate"
  | "deactivate";

export interface PartnerLifecycleActionRule {
  /** The admin runtime command key that triggers this action. */
  readonly admin: string;
  readonly from: readonly PartnerStatusValue[];
  readonly to: PartnerStatusValue;
}

export declare const PARTNER_PHASES: readonly PartnerPhase[];
export declare const PARTNER_PHASE_LABELS: Readonly<Record<PartnerPhase, string>>;
export declare const PARTNER_STATUS_DEFINITIONS: readonly {
  readonly value: PartnerStatusValue;
  readonly label: string;
  readonly phase: PartnerPhase;
}[];
export declare const PARTNER_STATUS_VALUES: readonly PartnerStatusValue[];
export declare const PARTNER_STATUS_PHASES: Readonly<
  Record<PartnerStatusValue, PartnerPhase>
>;
export declare const PARTNER_STATUS_LABELS: Readonly<
  Record<PartnerStatusValue, string>
>;
export declare const PARTNER_POST_ACTIVATION_STATUSES: readonly PartnerStatusValue[];
export declare const PARTNER_LIFECYCLE_ACTIONS: Readonly<
  Record<PartnerLifecycleActionKey, PartnerLifecycleActionRule>
>;
export declare const PARTNER_ACCOUNT_STATUS_DEFINITIONS: readonly {
  readonly value: PartnerAccountStatusValue;
  readonly label: string;
  readonly explanation: string;
}[];
export declare const PARTNER_ACCOUNT_STATUS_LABELS: Readonly<
  Record<PartnerAccountStatusValue, string>
>;
export declare const PARTNER_ACCOUNT_STATUS_HELP: string;

export declare function partnerPhaseOf(
  status: string | null | undefined,
): PartnerPhase | null;
export declare function partnerPhaseLabel(
  status: string | null | undefined,
): string | null;
export declare function isPartnerPostActivation(
  status: string | null | undefined,
): boolean;
export declare function canApplyPartnerAction(
  action: string,
  status: string | null | undefined,
): boolean;
