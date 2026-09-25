import { classifyLoginResponse } from "./auth-login-classify";

/*
 * ADR-0019 — the sign-in route handlers set cookies only for a response that
 * carries tokens. Before MFA a challenge (password right, code owed) had no
 * shape of its own and was reported to the browser as "Login response missing
 * tokens." with a 502.
 */
describe("classifyLoginResponse", () => {
  it("recognises a session by its token pair", () => {
    const result = classifyLoginResponse({
      user: { id: "u" },
      tenant: { slug: "acme" },
      tokens: { accessToken: "a", refreshToken: "r", sessionId: "s" },
    });

    expect(result.kind).toBe("session");
  });

  it("recognises an MFA challenge and keeps only its public fields", () => {
    const result = classifyLoginResponse({
      mfaRequired: true,
      challengeKind: "VERIFY",
      challengeToken: "header.payload.signature",
      methods: ["TOTP", "RECOVERY_CODE", 42],
      unexpected: "dropped",
    });

    expect(result).toEqual({
      kind: "challenge",
      challenge: {
        mfaRequired: true,
        challengeKind: "VERIFY",
        challengeToken: "header.payload.signature",
        methods: ["TOTP", "RECOVERY_CODE"],
      },
    });
  });

  it("recognises a setup-required challenge", () => {
    expect(
      classifyLoginResponse({
        mfaRequired: true,
        challengeKind: "SETUP_REQUIRED",
        challengeToken: "t",
      }),
    ).toMatchObject({
      kind: "challenge",
      challenge: { challengeKind: "SETUP_REQUIRED", methods: ["TOTP"] },
    });
  });

  it("never treats a challenge as a session unless it carries a real token pair", () => {
    const result = classifyLoginResponse({
      mfaRequired: true,
      challengeKind: "VERIFY",
      challengeToken: "t",
      tokens: { accessToken: 1 },
    });

    expect(result.kind).toBe("challenge");
  });

  it.each([
    null,
    "text",
    [],
    { tokens: { accessToken: "a" } },
    { mfaRequired: true },
    { mfaRequired: true, challengeToken: "t", challengeKind: "OTHER" },
  ])("rejects an unusable body: %p", (body) => {
    expect(classifyLoginResponse(body).kind).toBe("invalid");
  });
});
