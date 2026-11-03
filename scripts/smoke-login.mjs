/*
 * The request body of every smoke:deployment sign-in (DP-QA-048).
 *
 * POST /auth/login answers AUTH_UNAUTHORIZED "Company or tenant context is required
 * to sign in." unless the body carries tenantSlug (or tenantCode, domain, host,
 * tenantId); the Origin header is not read for sign-in. A smoke login without a
 * slug therefore cannot succeed for a tenant user, so it fails here with a message
 * that names the missing variable instead of an anonymous 401.
 */
export function loginBody(credentials, slug, extra = {}) {
  const tenantSlug = typeof slug === "string" ? slug.trim().toLowerCase() : "";
  if (!tenantSlug) {
    throw new Error(
      "Tenant context is required to sign in: set SMOKE_TENANT_SLUG (and " +
        "SMOKE_STARTER_TENANT_SLUG for the Starter probe). /auth/login does not " +
        "read the Origin header.",
    );
  }
  return JSON.stringify({ ...credentials, ...extra, tenantSlug });
}
