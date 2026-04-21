import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_TOKEN_COOKIE, DASHBOARD_ROUTE, LOGIN_ROUTE } from "@/lib/auth-config";

function getDefaultRedirectPath(hasAccessToken: boolean): string {
  return hasAccessToken ? DASHBOARD_ROUTE : LOGIN_ROUTE;
}

export default async function Home(): Promise<never> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const redirectPath = getDefaultRedirectPath(Boolean(accessToken));

  redirect(redirectPath);
}