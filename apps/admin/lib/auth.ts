import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACCESS_DENIED_ROUTE,
  ACCESS_TOKEN_COOKIE,
  getAdminLoginUrl,
  
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

function decodeJwtPayload<T>(token: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return null;
    }

    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");

    return JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return null;
  }

  return decodeJwtPayload<AdminSessionUser>(accessToken);
}

export async function requireSuperAdminUser(nextPath = "/tenants") {
  const user = await getSessionUser();

  if (!user) {
    redirect(getAdminLoginUrl(nextPath));
  }

  if (!user.roleKeys?.includes("super-admin")) {
    redirect(ACCESS_DENIED_ROUTE);
  }

  return user;
}
