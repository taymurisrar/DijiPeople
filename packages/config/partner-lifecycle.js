/*
 * Partner lifecycle — the one shared statement of how a partner's status reads
 * and moves (ADR-0026, EXECPLAN-0055 WP-04).
 *
 * A partner carries two persisted status fields: `PartnerStatus`, 24 values
 * spanning the public inquiry flow and the console flow, and
 * `PartnerAccountStatus`, which records portal access. Neither changes through
 * a field edit. This module is imported by the API (to enforce transitions) and
 * by the admin app (to decide which commands to offer and how to label the
 * header), so the two cannot disagree the way they did: the admin hid Activate
 * in INFORMATION_APPROVED — exactly the state where activation succeeds — and
 * showed it in ONBOARDING_PENDING, where it must fail.
 *
 * The phase is derived, never stored. `partner-lifecycle.test.js` fails if a
 * PartnerStatus is added to schema.prisma without a phase here.
 */

const PARTNER_PHASES = Object.freeze([
  "PROSPECT",
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
]);

const PARTNER_PHASE_LABELS = Object.freeze({
  PROSPECT: "Prospect",
  ONBOARDING: "Onboarding",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  CLOSED: "Closed",
});

/*
 * Every PartnerStatus, in the order the lifecycle normally visits them, with
 * its phase and label. PROSPECT is "applied or being assessed"; ONBOARDING is
 * "accepted, contracting and onboarding until activation"; CLOSED gathers the
 * terminal and dormant ends (rejected, deactivated, terminated).
 */
const PARTNER_STATUS_DEFINITIONS = Object.freeze([
  { value: "DRAFT", label: "Draft", phase: "PROSPECT" },
  { value: "INQUIRY", label: "Inquiry", phase: "PROSPECT" },
  { value: "NEW_INQUIRY", label: "New inquiry", phase: "PROSPECT" },
  { value: "UNDER_REVIEW", label: "Under review", phase: "PROSPECT" },
  {
    value: "MORE_INFORMATION_REQUIRED",
    label: "More information required",
    phase: "PROSPECT",
  },
  { value: "QUALIFIED", label: "Qualified", phase: "PROSPECT" },
  {
    value: "APPROVED_AWAITING_AGREEMENT",
    label: "Approved, awaiting agreement",
    phase: "ONBOARDING",
  },
  { value: "AGREEMENT_DRAFTING", label: "Agreement drafting", phase: "ONBOARDING" },
  { value: "INTERNAL_APPROVAL", label: "Internal approval", phase: "ONBOARDING" },
  {
    value: "AGREEMENT_IN_PROGRESS",
    label: "Agreement in progress",
    phase: "ONBOARDING",
  },
  { value: "AWAITING_SIGNATURE", label: "Awaiting signature", phase: "ONBOARDING" },
  { value: "FULLY_SIGNED", label: "Fully signed", phase: "ONBOARDING" },
  { value: "AGREEMENT_EXECUTED", label: "Agreement executed", phase: "ONBOARDING" },
  { value: "ONBOARDING_PENDING", label: "Onboarding pending", phase: "ONBOARDING" },
  { value: "ONBOARDING_INVITED", label: "Onboarding invited", phase: "ONBOARDING" },
  {
    value: "ONBOARDING_IN_PROGRESS",
    label: "Onboarding in progress",
    phase: "ONBOARDING",
  },
  { value: "SUBMITTED", label: "Onboarding submitted", phase: "ONBOARDING" },
  {
    value: "INFORMATION_APPROVED",
    label: "Onboarding approved",
    phase: "ONBOARDING",
  },
  {
    value: "APPROVED_FOR_ACTIVATION",
    label: "Approved for activation",
    phase: "ONBOARDING",
  },
  { value: "ACTIVE", label: "Active", phase: "ACTIVE" },
  { value: "SUSPENDED", label: "Suspended", phase: "SUSPENDED" },
  { value: "INACTIVE", label: "Inactive", phase: "CLOSED" },
  { value: "TERMINATED", label: "Terminated", phase: "CLOSED" },
  { value: "REJECTED", label: "Rejected", phase: "CLOSED" },
]);

const PARTNER_STATUS_VALUES = Object.freeze(
  PARTNER_STATUS_DEFINITIONS.map((definition) => definition.value),
);

const PARTNER_STATUS_PHASES = Object.freeze(
  Object.fromEntries(
    PARTNER_STATUS_DEFINITIONS.map((definition) => [
      definition.value,
      definition.phase,
    ]),
  ),
);

const PARTNER_STATUS_LABELS = Object.freeze(
  Object.fromEntries(
    PARTNER_STATUS_DEFINITIONS.map((definition) => [
      definition.value,
      definition.label,
    ]),
  ),
);

/*
 * A partner that has been live. Application decisions (qualify, reject), agreement
 * signing and onboarding must never move one of these back into the funnel —
 * qualifyInquiry used to demote an ACTIVE partner to APPROVED_AWAITING_AGREEMENT
 * and rejectInquiry to REJECTED.
 */
const PARTNER_POST_ACTIVATION_STATUSES = Object.freeze([
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
  "TERMINATED",
]);

/*
 * The governed status actions, keyed by the API's action name, with the
 * statuses each may start from and the status it produces. `admin` is the
 * runtime command key the admin console declares for it. The API enforces
 * `from`; the admin shows the command only in those statuses.
 *
 * `requiresInquiry` marks the application-review actions. They decide a
 * partner application (a PartnerInquiry), so they apply only to a partner that
 * came in through the public inquiry form. A partner an operator creates in the
 * console starts at DRAFT with no inquiry and takes the agreement-first path
 * instead (create agreement, sign, onboard, activate); the API refuses these
 * actions for it with PARTNER_INQUIRY_REQUIRED and the console does not offer
 * them.
 */
const PARTNER_LIFECYCLE_ACTIONS = Object.freeze({
  "start-review": Object.freeze({
    admin: "start-review",
    requiresInquiry: true,
    from: Object.freeze(["INQUIRY", "NEW_INQUIRY", "MORE_INFORMATION_REQUIRED"]),
    to: "UNDER_REVIEW",
  }),
  approve: Object.freeze({
    admin: "approve-partner",
    requiresInquiry: true,
    from: Object.freeze([
      "INQUIRY",
      "NEW_INQUIRY",
      "UNDER_REVIEW",
      "MORE_INFORMATION_REQUIRED",
    ]),
    to: "APPROVED_AWAITING_AGREEMENT",
  }),
  reject: Object.freeze({
    admin: "reject-partner",
    requiresInquiry: true,
    from: Object.freeze([
      "INQUIRY",
      "NEW_INQUIRY",
      "UNDER_REVIEW",
      "MORE_INFORMATION_REQUIRED",
      "APPROVED_AWAITING_AGREEMENT",
    ]),
    to: "REJECTED",
  }),
  "request-information": Object.freeze({
    admin: "request-information",
    requiresInquiry: true,
    from: Object.freeze(["INQUIRY", "NEW_INQUIRY", "UNDER_REVIEW"]),
    to: "MORE_INFORMATION_REQUIRED",
  }),
  activate: Object.freeze({
    admin: "activate",
    from: Object.freeze(["INFORMATION_APPROVED", "APPROVED_FOR_ACTIVATION"]),
    to: "ACTIVE",
  }),
  suspend: Object.freeze({
    admin: "suspend-partner",
    from: Object.freeze(["ACTIVE"]),
    to: "SUSPENDED",
  }),
  reactivate: Object.freeze({
    admin: "reactivate-partner",
    from: Object.freeze(["SUSPENDED", "INACTIVE"]),
    to: "ACTIVE",
  }),
  deactivate: Object.freeze({
    admin: "deactivate-partner",
    from: Object.freeze(["ACTIVE", "SUSPENDED"]),
    to: "INACTIVE",
  }),
  /*
   * EXECPLAN-0055 WP-05 (D6). Sending — or resending — the onboarding link.
   * It starts once the partner agreement is executed and stays available until
   * the partner submits onboarding, so an expired or lost link can be replaced.
   * It used to have no guard at all and demoted an ACTIVE partner to
   * ONBOARDING_PENDING. A resend never moves a partner backwards: one already
   * in ONBOARDING_IN_PROGRESS (changes requested) keeps that status, which the
   * API applies on top of `to`.
   */
  "send-onboarding-link": Object.freeze({
    admin: "send-onboarding-link",
    from: Object.freeze([
      "AGREEMENT_EXECUTED",
      "FULLY_SIGNED",
      "ONBOARDING_PENDING",
      "ONBOARDING_INVITED",
      "ONBOARDING_IN_PROGRESS",
    ]),
    to: "ONBOARDING_INVITED",
  }),
});

/*
 * Statuses in which the partner has already completed onboarding (submitted,
 * approved or live). Sending an onboarding link there is refused as "already
 * onboarded" rather than as a generic unavailable action.
 */
const PARTNER_ONBOARDED_STATUSES = Object.freeze([
  "SUBMITTED",
  "INFORMATION_APPROVED",
  "APPROVED_FOR_ACTIVATION",
  "ACTIVE",
]);

const PARTNER_ACCOUNT_STATUS_DEFINITIONS = Object.freeze([
  {
    value: "NOT_PROVISIONED",
    label: "Not provisioned",
    explanation: "No portal account yet. Activate partner sends the invitation.",
  },
  {
    value: "INVITED",
    label: "Invited",
    explanation: "Set by Activate partner. The portal invitation has been sent.",
  },
  {
    value: "ACTIVE",
    label: "Active",
    explanation: "Set when the partner contact accepts the portal invitation.",
  },
  {
    value: "SUSPENDED",
    label: "Suspended",
    explanation: "Set by Suspend. Reactivate restores access.",
  },
  {
    value: "DISABLED",
    label: "Disabled",
    explanation: "Set by Deactivate. Reactivate restores access.",
  },
]);

const PARTNER_ACCOUNT_STATUS_LABELS = Object.freeze(
  Object.fromEntries(
    PARTNER_ACCOUNT_STATUS_DEFINITIONS.map((definition) => [
      definition.value,
      definition.label,
    ]),
  ),
);

const PARTNER_ACCOUNT_STATUS_HELP =
  "Changed only by actions: Activate partner (Invited), portal sign-up (Active), Suspend (Suspended), Deactivate (Disabled).";

function partnerPhaseOf(status) {
  return (status && PARTNER_STATUS_PHASES[status]) || null;
}

function partnerPhaseLabel(status) {
  const phase = partnerPhaseOf(status);
  return phase ? PARTNER_PHASE_LABELS[phase] : null;
}

function isPartnerPostActivation(status) {
  return PARTNER_POST_ACTIVATION_STATUSES.includes(status);
}

/** Whether `action` may start from `status`; unknown actions never may. */
function canApplyPartnerAction(action, status) {
  const rule = PARTNER_LIFECYCLE_ACTIONS[action];
  return Boolean(rule && rule.from.includes(status));
}

module.exports = {
  PARTNER_PHASES,
  PARTNER_PHASE_LABELS,
  PARTNER_STATUS_DEFINITIONS,
  PARTNER_STATUS_VALUES,
  PARTNER_STATUS_PHASES,
  PARTNER_STATUS_LABELS,
  PARTNER_POST_ACTIVATION_STATUSES,
  PARTNER_LIFECYCLE_ACTIONS,
  PARTNER_ONBOARDED_STATUSES,
  PARTNER_ACCOUNT_STATUS_DEFINITIONS,
  PARTNER_ACCOUNT_STATUS_LABELS,
  PARTNER_ACCOUNT_STATUS_HELP,
  partnerPhaseOf,
  partnerPhaseLabel,
  isPartnerPostActivation,
  canApplyPartnerAction,
};
