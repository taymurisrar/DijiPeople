import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACCESS_DENIED_ROUTE,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  getAdminLoginUrl,
  getApiBaseUrl,
} from "@/lib/auth-config";

export type AdminSessionUser = {
  sub: string;
  userId: string;
  tenantId: string;
  tenantName: string;
  email: string;
  firstName: string;
  lastName: string;
  roleIds: string[];
  roleKeys?: string[];
  permissionKeys: string[];
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
  };
  tenant: { name: string };
  roles?: Array<{ id: string; key: string }>;
  permissions?: string[];
};

export async function getSessionUser() {
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

  if (!response?.ok) return null;
  const data = (await response.json().catch(() => null)) as AuthMeResponse | null;
  if (!data?.user || !data.tenant) return null;
  const userId = data.user.userId ?? data.user.id;
  if (!userId) return null;

  return {
    sub: userId,
    userId,
    tenantId: data.user.tenantId,
    tenantName: data.tenant.name,
    email: data.user.email,
    firstName: data.user.firstName,
    lastName: data.user.lastName,
    roleIds: data.user.roleIds ?? data.roles?.map((role) => role.id) ?? [],
    roleKeys: data.user.roleKeys ?? data.roles?.map((role) => role.key) ?? [],
    permissionKeys: data.user.permissionKeys ?? data.permissions ?? [],
  } satisfies AdminSessionUser;
}

export async function requireSystemAdminUser(nextPath = "/tenants") {
  const user = await getSessionUser();

  if (!user) {
    redirect(getAdminLoginUrl(nextPath));
  }

  if (!user.roleKeys?.includes("system-admin")) {
    redirect(ACCESS_DENIED_ROUTE);
  }

  return user;
}
