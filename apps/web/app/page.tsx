import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACCESS_TOKEN_COOKIE,
  DASHBOARD_ROUTE,
  LOGIN_ROUTE,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/auth-config";
import { getApiBaseUrl } from "@/lib/auth";

export default async function Home(): Promise<never> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    redirect(LOGIN_ROUTE);
  }

  try {
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
    });

    if (!response.ok) {
      redirect(LOGIN_ROUTE);
    }

    redirect(DASHBOARD_ROUTE);
  } catch {
    redirect(LOGIN_ROUTE);
  }
}
