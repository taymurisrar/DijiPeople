export type CommandPayloadField = {
  readonly key: string;
  readonly label: string;
  readonly type: "select" | "lookup" | "multiline";
  readonly required?: boolean;
  readonly optionsSource?: string;
  readonly visibleWhen?: {
    readonly field: string;
    readonly equals: string;
  };
};

export type CommandPayloadSchema = {
  readonly key: string;
  readonly title: string;
  readonly submitLabel: string;
  readonly contextPath?: string;
  /**
   * Run the command straight away instead of opening a drawer.
   *
   * For commands whose payload the client assembles on its own — a location
   * capture, say — there is nothing to ask, and a form with no questions is a
   * button that exists only to be pressed a second time.
   */
  readonly autoSubmit?: boolean;
  readonly fields: readonly CommandPayloadField[];
  readonly geolocation?: {
    /** Always capture, regardless of what the payload says. */
    readonly always?: boolean;
    readonly requiredWhen?: {
      readonly field: string;
      readonly values: readonly string[];
    };
  };
};

const schemas: Readonly<Record<string, CommandPayloadSchema>> = {
  /*
   * Check in asks the employee NOTHING.
   *
   * It used to open with a required "Work Mode" select, which made the employee
   * declare whether they were in the office — the one claim the server must
   * decide for itself, because asserting OFFICE from a sofa is how the
   * device-required rule gets bypassed. Location is captured on click and the
   * server derives the mode, the work site and whether the punch is permitted.
   *
   * `autoSubmit` therefore skips the drawer entirely: with no question to ask,
   * a form asking nothing and a second button to press are pure friction.
   */
  "attendance.checkIn": {
    key: "attendance.checkIn",
    title: "Check In",
    submitLabel: "Check In",
    contextPath: "/api/attendance/runtime-context",
    autoSubmit: true,
    fields: [],
    // Unconditional. The server cannot decide office-versus-remote without a
    // position, and it is the server that decides.
    geolocation: { always: true },
  },
  "attendance.checkOut": {
    key: "attendance.checkOut",
    title: "Check Out",
    submitLabel: "Check Out",
    contextPath: "/api/attendance/runtime-context",
    autoSubmit: true,
    fields: [],
    geolocation: { always: true },
  },
  /*
   * Approving asks for a comment and does not insist on one: the decision is
   * the record, and demanding prose to agree with something produces "ok" and
   * "fine" rather than reasons.
   */
  "approval.approve": {
    key: "approval.approve",
    title: "Approve request",
    submitLabel: "Approve",
    fields: [
      { key: "comment", label: "Comment (optional)", type: "multiline" },
    ],
  },
  /*
   * Rejecting does insist. The requester is told no and has to decide what to
   * do next, and "Rejected" on its own does not tell them. Two of the modules
   * behind this screen already refuse a reasonless rejection server-side —
   * `RejectClaimDto.reason` and `RejectLoanDto.reason` are both required — so
   * asking here matches what those APIs would say anyway.
   */
  "approval.reject": {
    key: "approval.reject",
    title: "Reject request",
    submitLabel: "Reject",
    fields: [
      { key: "comment", label: "Reason", type: "multiline", required: true },
    ],
  },
  "approval.cancel": {
    key: "approval.cancel",
    title: "Withdraw request",
    submitLabel: "Withdraw",
    fields: [
      { key: "comment", label: "Reason (optional)", type: "multiline" },
    ],
  },
};

export function getCommandPayloadSchema(key?: string) {
  return key ? (schemas[key] ?? null) : null;
}
