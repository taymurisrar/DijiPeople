import type { CommandFailureContract } from "./command-failure-message";

/**
 * Whether a failed command is the product refusing, or the product breaking.
 *
 * WHY THIS EXISTS. Pressing Approve on your own attendance correction produced
 * the platform's fatal-error dialog: a red `ERROR ACCESS_DENIED` heading, "You
 * do not have permission to perform this action.", a reference id, a timestamp
 * and a **Download log** button — for a rule the product deliberately enforces
 * and had just enforced correctly. That dialog is for defects. A business rule
 * is not a defect; it is the system working, and it needs a sentence the user
 * can act on and then dismiss.
 *
 * Attendance already had this split, written for exactly the same reason
 * (`lib/attendance/attendance-outcome.ts`, "a refused check-in was being routed
 * into the platform's fatal-error dialog"). It was per-module, so every other
 * module kept the fatal dialog. This is that reasoning made generic, so a new
 * command inherits the right treatment instead of having to remember it.
 *
 * Kept free of React so the Node test runner can exercise it.
 */

export type CommandFailureKind =
  /** The product refused, on purpose, for a stated reason. Show a toast. */
  | "business"
  /** Something went wrong. The technical dialog, with its trace id, owns this. */
  | "unexpected";

export type CommandFailureClassification = {
  readonly kind: CommandFailureKind;
  readonly title: string;
  readonly description?: string;
  /** Preserved so telemetry and tests can assert on the decision. */
  readonly errorCode: string;
  readonly statusCode: number;
};

/**
 * The statuses the API's error contract uses when it is answering, not failing.
 *
 * Deliberately status-based rather than a list of error codes. The catalog in
 * `common/errors/error-catalog.ts` grows with every feature, and a code-list
 * here would be a second copy of it that silently misclassifies whatever was
 * added last — the failure mode being that a real defect gets a friendly toast.
 * A status is part of the HTTP contract and does not drift.
 *
 * Absent, and each for a reason:
 *
 * - **401** — the modal owns this: `isSessionExpiredError` gives it a Sign in
 *   action, which a toast cannot offer. Re-routing it would strand the user.
 * - **404** — ambiguous. "This request no longer exists" is a business answer,
 *   but so is a mistyped route, and a dead route must stay loud.
 * - **5xx, network, non-JSON** — defects by definition.
 */
const BUSINESS_REFUSAL_STATUSES = new Set([
  400, // validation — a DTO rejected the input
  403, // refused — permission or an object-level rule such as self-approval
  409, // conflict — already decided, already exists, wrong state
  422, // unprocessable — accepted shape, refused content
]);

export function classifyCommandFailure(
  contract: CommandFailureContract,
): CommandFailureClassification {
  const base = {
    errorCode: contract.errorCode,
    statusCode: contract.statusCode,
  };

  if (!BUSINESS_REFUSAL_STATUSES.has(contract.statusCode)) {
    return { ...base, kind: "unexpected", title: contract.message };
  }

  /*
   * A business status is necessary and not sufficient. A proxy, a WAF or a
   * Next.js route handler can return 400 or 403 with an HTML body or an empty
   * one, and `readCommandFailureContract` fills the gaps with its own defaults —
   * so the shape has to be checked, not assumed. Without this, an infrastructure
   * failure would be shown as a calm sentence and nobody would look at it.
   */
  if (!looksLikeApiErrorContract(contract)) {
    return { ...base, kind: "unexpected", title: contract.message };
  }

  return {
    ...base,
    kind: "business",
    title: contract.message,
    description: describeWithoutRepeating(contract),
  };
}

/**
 * Whether this really is the API's error envelope.
 *
 * The envelope always carries a stable `errorCode` and a message written for a
 * person. `readCommandFailureContract` derives a code from the status when the
 * body has none, so a derived code proves nothing — what proves it is a message
 * the server actually sent, rather than the reader's own fallback.
 */
function looksLikeApiErrorContract(contract: CommandFailureContract): boolean {
  if (!contract.errorCode.trim()) return false;

  const message = contract.message.trim();
  if (!message) return false;
  if (message === "Command failed") return false;

  // An HTML body or a stack trace is not a sentence for a user.
  if (message.startsWith("<") || message.includes("\n")) return false;

  return true;
}

/**
 * The second line, when it adds something.
 *
 * `HttpExceptionFilter` fills `description` with a generic sentence whenever the
 * thrower did not supply one — "You do not have permission to perform this
 * action." under a headline that already said precisely which action and why.
 * Repeating that under a specific message makes the specific one look like
 * boilerplate too.
 */
function describeWithoutRepeating(
  contract: CommandFailureContract,
): string | undefined {
  const description = contract.description?.trim();
  if (!description) return undefined;
  if (description.toLowerCase() === contract.message.trim().toLowerCase()) {
    return undefined;
  }
  if (GENERIC_DESCRIPTIONS.has(description.toLowerCase())) return undefined;

  return description;
}

const GENERIC_DESCRIPTIONS = new Set([
  "you do not have permission to perform this action.",
  "the requested action could not be completed.",
  "the request could not be completed.",
]);
