/**
 * DP-QA-002: a 403 from /employees/me/context is a permission refusal, not an
 * unlinked account. It must stay distinguishable so /my-profile does not tell
 * the user to ask an administrator to "link" an account that is already linked.
 */
const apiRequestJson = jest.fn();

class FakeApiRequestError extends Error {
  constructor(public status: number) {
    super(`status ${status}`);
  }
}

jest.mock("@/lib/server-api", () => ({
  ApiRequestError: FakeApiRequestError,
  apiRequestJson: (...args: unknown[]) => apiRequestJson(...args),
}));

import { getCurrentEmployee } from "./current-employee";

describe("getCurrentEmployee", () => {
  beforeEach(() => apiRequestJson.mockReset());

  it("flags a 403 as accessDenied rather than as an unlinked account", async () => {
    apiRequestJson.mockRejectedValue(new FakeApiRequestError(403));
    await expect(getCurrentEmployee()).resolves.toEqual({
      employee: null,
      isReportingManager: false,
      accessDenied: true,
    });
  });

  it("returns an unlinked account without the accessDenied flag", async () => {
    apiRequestJson.mockResolvedValue({
      employee: null,
      isReportingManager: false,
    });
    const result = await getCurrentEmployee();
    expect(result.employee).toBeNull();
    expect(result.accessDenied).toBeUndefined();
  });

  it("still throws on other failures", async () => {
    apiRequestJson.mockRejectedValue(new FakeApiRequestError(500));
    await expect(getCurrentEmployee()).rejects.toThrow("status 500");
  });
});
