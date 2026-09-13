import { buildCommandRequestError } from "../command-failure-message";
import type { CommandDefinition } from "../command-runtime.types";

/**
 * The employee record's account actions — Reset Password and Send Invitation.
 *
 * Kept out of the client form wrapper so the command definitions and the
 * request they make can be tested without rendering the record page
 * (`apps/web` jest has no DOM).
 */
export const employeeAccountActionCommands: readonly CommandDefinition[] = [
  {
    key: "employees.resetPassword",
    label: "Reset Password",
    description: "Send a reset password link to this employee's work email.",
    scope: "record",
    placement: "detail-command-bar",
    executionMode: "client",
    handlerKey: "employees.resetPassword",
    order: 32,
    /*
     * BUG-3497 — this sent a real reset email on the first click, and was
     * offered for employees with no login at all, which the API refuses
     * (`employee-profiles.service.ts`). The confirmation reuses the runtime's
     * own command confirmation dialog; the rule reads `hasLinkedUser`, which
     * `mapEmployeeRecordToRuntimeValues` derives from `userId`.
     */
    confirmation: {
      title: "Send password reset link?",
      confirmLabel: "Send link",
    },
    visibilityRules: [
      {
        operator: "field-equals",
        fieldLogicalName: "hasLinkedUser",
        expectedValue: true,
      },
    ],
  },
  {
    key: "employees.sendInvitation",
    label: "Send Invitation",
    description:
      "Send an activation invitation to a new employee who has not logged in yet.",
    scope: "record",
    placement: "detail-command-bar",
    executionMode: "client",
    handlerKey: "employees.sendInvitation",
    order: 33,
    /*
     * Only offered to someone who has a login and has never used it. Once they
     * have signed in the invitation is meaningless, and "Reset Password" is the
     * action that actually helps.
     */
    visibilityRules: [
      {
        operator: "field-equals",
        fieldLogicalName: "hasNeverLoggedIn",
        expectedValue: true,
      },
    ],
  },
];

export type EmployeeActionFetch = (
  input: string,
  init: { readonly method: "POST" },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;

/**
 * POSTs an employee account action and throws a failure that keeps the
 * response's status and envelope (see `CommandRequestError`), so an expected
 * refusal is classified as one.
 */
export async function postEmployeeAction(
  employeeId: string,
  action: "send-reset-password-link" | "resend-invite",
  fetchImpl: EmployeeActionFetch = (input, init) => fetch(input, init),
): Promise<unknown> {
  const response = await fetchImpl(
    `/api/employees/${encodeURIComponent(employeeId)}/${action}`,
    { method: "POST" },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw buildCommandRequestError(response.status, payload);
  }

  return payload;
}
