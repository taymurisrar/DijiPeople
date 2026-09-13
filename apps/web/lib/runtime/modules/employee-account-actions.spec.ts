import { classifyCommandFailure } from "../command-failure-classification";
import { readCommandFailureContract } from "../command-failure-message";
import { isVisibleByRules } from "../visibility.resolver";
import {
  employeeAccountActionCommands,
  postEmployeeAction,
  type EmployeeActionFetch,
} from "./employee-account-actions";
import {
  mapEmployeeLookupDisplayValues,
  mapEmployeeRecordToRuntimeValues,
} from "./employee-metadata.adapter";

/*
 * BUG-3497 — Reset Password on an employee with no linked user sent the request
 * without asking, the API refused it with a 400, nothing appeared on screen,
 * and the client logged the refusal as SYSTEM_UNEXPECTED_ERROR / 500 to the
 * production error log.
 *
 * The refusal path is tested through the same reader and classifier the
 * command handler uses (`readCommandFailureContract` on `error.data`, which is
 * what `executeInjectedHandler` passes), not through a copy of their logic.
 */

/** The envelope `HttpExceptionFilter` sent in the walkthrough. */
const RESET_REFUSAL = {
  success: false,
  traceId: "req_0d6c7b9e",
  statusCode: 400,
  errorCode: "VALIDATION_FAILED",
  message:
    "A password reset link can only be sent to an employee with a linked user account.",
  description: "The request could not be completed.",
  path: "/api/employees/emp-1/send-reset-password-link",
  method: "POST",
};

function respondWith(status: number, body: unknown): EmployeeActionFetch {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

async function failureFrom(fetchImpl: EmployeeActionFetch) {
  try {
    await postEmployeeAction("emp-1", "send-reset-password-link", fetchImpl);
  } catch (error) {
    // Exactly what `readErrorData` in command-execution.service.ts reads.
    return readCommandFailureContract(
      (error as { data?: unknown }).data,
      error instanceof Error ? error.message : undefined,
    );
  }
  throw new Error("expected the action to fail");
}

describe("employee account action failures keep their HTTP status", () => {
  it("classifies the API's 400 refusal as a business answer, not a 500", async () => {
    const contract = await failureFrom(respondWith(400, RESET_REFUSAL));

    expect(contract.statusCode).toBe(400);
    expect(contract.errorCode).toBe("VALIDATION_FAILED");
    expect(contract.statusCode).not.toBe(500);

    const failure = classifyCommandFailure(contract);
    expect(failure.kind).toBe("business");
    expect(failure.title).toBe(RESET_REFUSAL.message);
  });

  it("still treats a genuine 5xx as unexpected", async () => {
    const contract = await failureFrom(
      respondWith(500, {
        statusCode: 500,
        errorCode: "SYSTEM_UNEXPECTED_ERROR",
        message: "Internal server error",
      }),
    );

    expect(contract.statusCode).toBe(500);
    expect(classifyCommandFailure(contract).kind).toBe("unexpected");
  });

  it("keeps a 4xx with no API envelope loud", async () => {
    // A proxy's HTML page or an empty body is infrastructure, not a refusal.
    const contract = await failureFrom(respondWith(400, null));

    expect(contract.statusCode).toBe(400);
    expect(classifyCommandFailure(contract).kind).toBe("unexpected");
  });

  it("returns the payload on success", async () => {
    await expect(
      postEmployeeAction(
        "emp-1",
        "send-reset-password-link",
        respondWith(201, { recipientEmail: "a@example.com" }),
      ),
    ).resolves.toEqual({ recipientEmail: "a@example.com" });
  });
});

describe("Reset Password is deliberate and only offered with a linked user", () => {
  const resetPassword = employeeAccountActionCommands.find(
    (command) => command.key === "employees.resetPassword",
  );
  const sendInvitation = employeeAccountActionCommands.find(
    (command) => command.key === "employees.sendInvitation",
  );
  const principal = { roleKeys: ["hr"], permissionKeys: [] };

  it("asks for confirmation before sending", () => {
    expect(resetPassword?.confirmation?.title).toBeTruthy();
  });

  it("is hidden for an employee with no linked user", () => {
    const record = mapEmployeeRecordToRuntimeValues({
      id: "emp-1",
      userId: null,
    });

    expect(resetPassword && isVisibleByRules(resetPassword, { principal, record })).toBe(
      false,
    );
  });

  it("is offered for an employee with a linked user", () => {
    const record = mapEmployeeRecordToRuntimeValues({
      id: "emp-1",
      userId: "user-1",
    });

    expect(resetPassword && isVisibleByRules(resetPassword, { principal, record })).toBe(
      true,
    );
  });

  it("offers Send Invitation when the API says the login was never used", () => {
    // The rule existed before; the flag it reads was never mapped, so it could
    // not pass for anyone.
    const record = mapEmployeeRecordToRuntimeValues({
      id: "emp-1",
      userId: "user-1",
      hasNeverLoggedIn: true,
    });

    expect(
      sendInvitation && isVisibleByRules(sendInvitation, { principal, record }),
    ).toBe(true);
  });
});

describe("owner display", () => {
  it("names the owner without appending their email", () => {
    const owner = { fullName: "Taimur Khan", email: "taimur@example.com" };

    expect(mapEmployeeLookupDisplayValues({ ownerUser: owner }).ownerId).toBe(
      "Taimur Khan",
    );
    expect(
      mapEmployeeRecordToRuntimeValues({ ownerUser: owner }).ownerDisplayName,
    ).toBe("Taimur Khan");
  });

  it("falls back to the email when there is no name", () => {
    expect(
      mapEmployeeLookupDisplayValues({
        ownerUser: { email: "owner@example.com" },
      }).ownerId,
    ).toBe("owner@example.com");
  });
});
