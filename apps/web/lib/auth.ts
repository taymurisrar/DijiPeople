import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getApiBaseUrl as getSharedApiBaseUrl } from "@repo/config";
import {
  ACCESS_TOKEN_COOKIE,
  LOGIN_ROUTE,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/auth-config";

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
  isTenantOwner?: boolean;
};

type AuthMeResponse = {
  user: {
    id?: string;
    userId?: string;
    tenantId: string;
    email: string;
    firstName: string;
    lastName: string;
    roleIds?: string[];
    roleKeys?: string[];
    permissionKeys?: string[];
    isTenantOwner?: boolean;
  };
  tenant: {
    id: string;
    name: string;
  };
  roles?: Array<{ id: string; key: string; name: string }>;
  permissions?: string[];
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSessionFromApi();
  return session;
}

export function getApiBaseUrl(): string {
  return getSharedApiBaseUrl(process.env);
}

export async function requireSessionUser(
  nextPath = "/dashboard",
): Promise<SessionUser> {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect(buildLoginUrl(nextPath));
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

async function getSessionFromApi(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return null;
  }

  const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
    headers: {
      Cookie: [
        accessToken ? `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(accessToken)}` : "",
        refreshToken ? `${REFRESH_TOKEN_COOKIE}=${encodeURIComponent(refreshToken)}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    },
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const data = (await response.json().catch(() => null)) as AuthMeResponse | null;
  if (!data?.user || !data.tenant) {
    return null;
  }

  const userId = data.user.userId ?? data.user.id;
  if (!userId) {
    return null;
  }

  const roleIds = isStringArray(data.user.roleIds)
    ? data.user.roleIds
    : (data.roles ?? []).map((role) => role.id);
  const roleKeys = isStringArray(data.user.roleKeys)
    ? data.user.roleKeys
    : (data.roles ?? []).map((role) => role.key);
  const permissionKeys = isStringArray(data.user.permissionKeys)
    ? data.user.permissionKeys
    : data.permissions ?? [];

  return {
    sub: userId,
    userId,
    tenantId: data.user.tenantId,
    tenantName: data.tenant.name,
    email: data.user.email,
    firstName: data.user.firstName,
    lastName: data.user.lastName,
    roleIds,
    roleKeys,
    permissionKeys,
    isTenantOwner: data.user.isTenantOwner,
  };
}

function buildLoginUrl(nextPath: string): string {
  const params = new URLSearchParams({
    next: nextPath,
  });

  return `${LOGIN_ROUTE}?${params.toString()}`;
}
