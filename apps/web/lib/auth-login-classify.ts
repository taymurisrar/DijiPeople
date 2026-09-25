/*
 * ADR-0019 — the pure half of the sign-in route handlers: what an API sign-in
 * answer is. Kept free of `next/*` imports so it is unit-testable, and shared
 * by the sign-in, MFA verify and MFA setup-confirm routes so the rule lives in
 * one place: cookies are written only for a response that carries tokens.
 */

export type JsonRecord = Record<string, unknown>;

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
  accessTokenExpiresIn?: string;
  refreshTokenExpiresIn?: string;
  rememberMe?: boolean;
};

export type MfaChallenge = {
  mfaRequired: true;
  challengeKind: "VERIFY" | "SETUP_REQUIRED";
  challengeToken: string;
  methods: string[];
};

export type LoginResponseClassification =
  | { kind: "session"; tokens: SessionTokens; user: unknown; tenant: unknown }
  | { kind: "challenge"; challenge: MfaChallenge }
  | { kind: "invalid" };

export function classifyLoginResponse(
  data: unknown,
): LoginResponseClassification {
  if (!isRecord(data)) return { kind: "invalid" };

  const tokens = data.tokens;
  if (
    isRecord(tokens) &&
    typeof tokens.accessToken === "string" &&
    typeof tokens.refreshToken === "string"
  ) {
    return {
      kind: "session",
      tokens: tokens as SessionTokens,
      user: data.user,
      tenant: data.tenant,
    };
  }

  if (
    data.mfaRequired === true &&
    typeof data.challengeToken === "string" &&
    (data.challengeKind === "VERIFY" ||
      data.challengeKind === "SETUP_REQUIRED")
  ) {
    return {
      kind: "challenge",
      challenge: {
        mfaRequired: true,
        challengeKind: data.challengeKind,
        challengeToken: data.challengeToken,
        methods: Array.isArray(data.methods)
          ? data.methods.filter(
              (method): method is string => typeof method === "string",
            )
          : ["TOTP"],
      },
    };
  }

  return { kind: "invalid" };
}


export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
