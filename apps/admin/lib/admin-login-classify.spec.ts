import { classifyAdminLoginResponse } from "./admin-login-classify";

/*
 * ADR-0019 — the admin sign-in route sets cookies only for a real token pair.
 * An MFA challenge used to fall into the "did not include usable token
 * payload" 502.
 */
describe("classifyAdminLoginResponse", () => {
  const longToken = "x".repeat(40);

  it("recognises a session by its token pair", () => {
    expect(
      classifyAdminLoginResponse({
        tokens: { accessToken: longToken, refreshToken: longToken },
      }).kind,
    ).toBe("session");
  });

  it("recognises a VERIFY challenge and keeps only its public fields", () => {
    expect(
      classifyAdminLoginResponse({
        mfaRequired: true,
        challengeKind: "VERIFY",
        challengeToken: "t",
        methods: ["TOTP", "RECOVERY_CODE"],
        extra: 1,
      }),
    ).toEqual({
      kind: "challenge",
      challenge: {
        mfaRequired: true,
        challengeKind: "VERIFY",
        challengeToken: "t",
        methods: ["TOTP", "RECOVERY_CODE"],
      },
    });
  });

  it.each([
    null,
    { tokens: { accessToken: "short", refreshToken: "short" } },
    { mfaRequired: true, challengeKind: "SETUP_REQUIRED", challengeToken: "t" },
    { mfaRequired: true, challengeKind: "VERIFY" },
  ])("rejects an unusable body: %p", (body) => {
    expect(classifyAdminLoginResponse(body).kind).toBe("invalid");
  });
});
