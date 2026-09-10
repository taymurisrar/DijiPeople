export const AUTH_APP_CLIENT_ID = "web";
const AUTH_COOKIE_PREFIX = process.env.AUTH_WEB_COOKIE_PREFIX ?? "dp_web";
export const ACCESS_TOKEN_COOKIE =
  process.env.AUTH_WEB_COOKIE_ACCESS_NAME ??
  process.env.WEB_ACCESS_TOKEN_COOKIE ??
  process.env.ACCESS_TOKEN_COOKIE ??
  `${AUTH_COOKIE_PREFIX}_access_token`;
export const REFRESH_TOKEN_COOKIE =
  process.env.AUTH_WEB_COOKIE_REFRESH_NAME ??
  process.env.WEB_REFRESH_TOKEN_COOKIE ??
  process.env.REFRESH_TOKEN_COOKIE ??
  `${AUTH_COOKIE_PREFIX}_refresh_token`;
export const SESSION_COOKIE =
  process.env.AUTH_WEB_COOKIE_SESSION_NAME ?? `${AUTH_COOKIE_PREFIX}_session_id`;
export const TENANT_SLUG_COOKIE =
  process.env.AUTH_WEB_COOKIE_TENANT_SLUG_NAME ??
  `${AUTH_COOKIE_PREFIX}_tenant_slug`;
export const DASHBOARD_ROUTE = "/";
export const LOGIN_ROUTE = "/login";
export const DEFAULT_AUTHENTICATED_ROUTE = "/";

/*
 * ITEM-0111 — this list used to omit twelve route trees under
 * `app/(authenticated)/`. `matchesPrefix` treats an absent prefix as "not
 * protected" rather than as a catch-all, so `isProtectedRoute` returned false
 * for every one of them: the proxy (`proxy.ts`) let an anonymous request
 * through instead of redirecting to `/login?next=<path>`, and the deep link
 * was lost when the authenticated layout's own fallback caught it later (it
 * no longer hardcodes "/" either — see `app/(authenticated)/layout.tsx`).
 * No content was ever served to an unauthenticated caller either way: this is
 * about which layer catches the request and whether the destination survives
 * sign-in, not about access.
 *
 * `auth-config.spec.ts` walks `app/(authenticated)/` and fails if a route
 * tree is added here without a matching prefix, so this list cannot drift
 * again the same way.
 */
export const PROTECTED_ROUTE_PREFIXES = [
  "/",
  "/me",
  "/my-profile",
  "/settings",
  "/employees",
  "/attendance",
  "/leaves",
  "/projects",
  "/payroll",
  "/timesheets",
  "/users",
  "/customers",
  "/reports",
  "/recruitment",
  "/onboarding",
  "/claims",
  "/business-trips",
  "/customization",
  "/access-denied",
  "/approvals",
  "/benefits",
  "/dlp-review",
  "/employee-bank-accounts",
  "/executive",
  "/hr",
  "/inbox",
  "/loans",
  "/manager",
  "/my-preferences",
  "/profile",
] as const;
export const PUBLIC_ROUTE_PREFIXES = [
  "/login",
  "/activate",
  "/activate-account",
  "/reset-password",
  "/api",
  "/_next",
] as const;
export const AUTH_ROUTES = ["/login"] as const;

function normalizePath(pathname: string): string {
  if (!pathname) return "/";

  const path = pathname.split("?")[0].split("#")[0];

  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path;
}

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => {
    if (prefix === "/") return pathname === "/";
    return pathname === prefix || pathname.startsWith(prefix + "/");
  });
}

export function isProtectedRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if (
    matchesPrefix(normalized, PUBLIC_ROUTE_PREFIXES) ||
    PUBLIC_FILE_PATTERN.test(normalized)
  ) {
    return false;
  }
  return matchesPrefix(normalized, PROTECTED_ROUTE_PREFIXES);
}

export function isAuthRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return AUTH_ROUTES.includes(normalized as (typeof AUTH_ROUTES)[number]);
}

export function shouldRedirectAuthenticatedUser(pathname: string): boolean {
  return isAuthRoute(pathname);
}

export function shouldRedirectUnauthenticatedUser(pathname: string): boolean {
  return isProtectedRoute(pathname);
}

const PUBLIC_FILE_PATTERN = /\.(?:ico|png|jpg|jpeg|gif|svg|webp|css|js|map|txt|xml|json)$/i;
