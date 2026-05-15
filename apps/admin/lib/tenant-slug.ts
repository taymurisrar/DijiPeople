export const RESERVED_TENANT_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "login",
  "logout",
  "signup",
  "register",
  "dashboard",
  "settings",
  "www",
  "dijipeople",
  "tenant",
  "tenants",
  "system",
  "platform",
  "portal",
  "support",
  "help",
  "docs",
  "billing",
  "account",
  "accounts",
  "root",
  "superadmin",
  "assets",
  "static",
  "cdn",
  "mail",
  "email",
  "smtp",
  "status",
  "health",
  "public",
  "private",
  "security",
  "sso",
  "oauth",
  "callback",
]);

export function normalizeTenantSlug(value: string) {
  return value.trim().toLowerCase();
}

export function validateTenantSlug(value: string) {
  const slug = normalizeTenantSlug(value);

  if (!slug) return "Tenant slug is required.";
  if (slug.length < 3) return "Tenant slug must be at least 3 characters.";
  if (slug.length > 63) return "Tenant slug must be 63 characters or fewer.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "Tenant slug must use lowercase letters, numbers, and single hyphens only.";
  }
  if (RESERVED_TENANT_SLUGS.has(slug)) {
    return "This tenant slug is reserved and cannot be used.";
  }

  return null;
}

export function suggestTenantSlug(value: string) {
  return normalizeTenantSlug(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}
