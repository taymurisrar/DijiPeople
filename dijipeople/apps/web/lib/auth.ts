import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getApiBaseUrl as getSharedApiBaseUrl } from "@repo/config";
import { ACCESS_TOKEN_COOKIE, LOGIN_ROUTE } from "@/lib/auth-config";

const JWT_CLOCK_SKEW_MS = 5_000;

export type SessionUser = {
  sub: string;
  userId: string;
  tenantId: string;
  tenantName: string;
  email: string;
  firstName: string;
  lastName: string;
  roleIds: string[];
  roleKeys: string[];
  permissionKeys: string[];
  exp?: number;
  iat?: number;
  nbf?: number;
};

type JwtPayload = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function normalizeSessionUser(payload: unknown): SessionUser | null {
  if (!isRecord(payload)) {
    return null;
  }

  const {
    sub,
    userId,
    tenantId,
    tenantName,
    email,
    firstName,
    lastName,
    roleIds,
    roleKeys,
    permissionKeys,
    exp,
    iat,
    nbf,
  } = payload;

  if (
    typeof sub !== "string" ||
    typeof userId !== "string" ||
    typeof tenantId !== "string" ||
    typeof email !== "string" ||
    typeof firstName !== "string" ||
    typeof lastName !== "string" ||
    !isStringArray(roleIds) ||
    !isStringArray(permissionKeys)
  ) {
    return null;
  }

  return {
    sub,
    userId,
    tenantId,
    tenantName:
      typeof tenantName === "string" && tenantName.trim().length > 0
        ? tenantName
        : "",
    email,
    firstName,
    lastName,
    roleIds,
    roleKeys: isStringArray(roleKeys) ? roleKeys : [],
    permissionKeys,
    exp: typeof exp === "number" ? exp : undefined,
    iat: typeof iat === "number" ? iat : undefined,
    nbf: typeof nbf === "number" ? nbf : undefined,
  };
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[1]) {
      return null;
    }

    const decoded = decodeBase64Url(parts[1]);
    if (!decoded) {
      return null;
    }

    const parsed: unknown = JSON.parse(decoded);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isJwtExpired(exp?: number, clockSkewMs = JWT_CLOCK_SKEW_MS): boolean {
  if (typeof exp !== "number") {
    return false;
  }

  return exp * 1000 <= Date.now() + clockSkewMs;
}

function isJwtNotYetValid(nbf?: number, clockSkewMs = JWT_CLOCK_SKEW_MS): boolean {
  if (typeof nbf !== "number") {
    return false;
  }

  return nbf * 1000 > Date.now() + clockSkewMs;
}

function parseSessionUserFromToken(token: string): SessionUser | null {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return null;
  }

  const sessionUser = normalizeSessionUser(payload);
  if (!sessionUser) {
    return null;
  }

  if (isJwtExpired(sessionUser.exp) || isJwtNotYetValid(sessionUser.nbf)) {
    return null;
  }

  return sessionUser;
}

async function getAccessTokenFromCookies(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    return null;
  }

  return parseSessionUserFromToken(accessToken);
}

export function getApiBaseUrl(): string {
  return getSharedApiBaseUrl(process.env);
}

export async function requireSessionUser(nextPath = "/dashboard"): Promise<SessionUser> {
  const accessToken = await getAccessTokenFromCookies();

  if (!accessToken) {
    redirect(buildLoginUrl(nextPath));
  }

  const sessionUser = parseSessionUserFromToken(accessToken);

  if (!sessionUser) {
    redirect(buildLogoutUrl(nextPath, "session-expired"));
  }

  return sessionUser;
}

export async function hasSession(): Promise<boolean> {
  const sessionUser = await getSessionUser();
  return sessionUser !== null;
}

export async function requirePermission(
  permissionKey: string,
  nextPath = "/dashboard",
): Promise<SessionUser> {
  const sessionUser = await requireSessionUser(nextPath);

  if (!sessionUser.permissionKeys.includes(permissionKey)) {
    redirect("/403");
  }

  return sessionUser;
}

export async function requireAnyPermission(
  permissionKeys: string[],
  nextPath = "/dashboard",
): Promise<SessionUser> {
  const sessionUser = await requireSessionUser(nextPath);

  const hasPermission = permissionKeys.some((permissionKey) =>
    sessionUser.permissionKeys.includes(permissionKey),
  );

  if (!hasPermission) {
    redirect("/403");
  }

  return sessionUser;
}

function buildLoginUrl(nextPath: string): string {
  const params = new URLSearchParams({
    next: nextPath,
  });

  return `${LOGIN_ROUTE}?${params.toString()}`;
}

function buildLogoutUrl(nextPath: string, reason: string): string {
  const params = new URLSearchParams({
    next: nextPath,
    reason,
  });

  return `/api/auth/logout?${params.toString()}`;
}
