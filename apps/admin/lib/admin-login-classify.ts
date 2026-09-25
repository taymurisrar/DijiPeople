/*
 * ADR-0019 — what an admin sign-in answer is. Pure (no `next/*`), shared by the
 * sign-in and MFA verify route handlers, so the rule lives in one place:
 * cookies are written only for a response that carries a usable token pair,
 * and an MFA challenge goes back to the browser with none.
 */

type JsonRecord = Record<string, unknown>;

export type AdminSessionTokens = {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
  rememberMe?: boolean;
};

export type AdminMfaChallenge = {
  mfaRequired: true;
  challengeKind: "VERIFY";
  challengeToken: string;
  methods: string[];
};

export type AdminLoginClassification =
  | { kind: "session"; tokens: AdminSessionTokens; user: unknown; tenant: unknown }
  | { kind: "challenge"; challenge: AdminMfaChallenge }
  | { kind: "invalid" };

export function classifyAdminLoginResponse(
  data: unknown,
): AdminLoginClassification {
  if (!isRecord(data)) return { kind: "invalid" };

  const tokens = data.tokens;
  if (
    isRecord(tokens) &&
    typeof tokens.accessToken === "string" &&
    typeof tokens.refreshToken === "string" &&
    tokens.accessToken.trim().length > 20 &&
    tokens.refreshToken.trim().length > 20
  ) {
    return {
      kind: "session",
      tokens: tokens as AdminSessionTokens,
      user: data.user,
      tenant: data.tenant,
    };
  }

  // Platform MFA has no enrolment-during-sign-in flow (it is optional for
  // operators), so VERIFY is the only challenge this app accepts.
  if (
    data.mfaRequired === true &&
    data.challengeKind === "VERIFY" &&
    typeof data.challengeToken === "string"
  ) {
    return {
      kind: "challenge",
      challenge: {
        mfaRequired: true,
        challengeKind: "VERIFY",
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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
