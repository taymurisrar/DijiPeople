const RESERVED_HOST_LABELS = new Set([
  "localhost",
  "127",
  "www",
  "app",
  "api",
  "login",
  "dashboard",
]);

export function resolveTenantSlugFromRequest(input: {
  host?: string | null;
  queryTenant?: string | null;
}) {
  const queryTenant = normalizeTenantSlug(input.queryTenant);

  if (queryTenant) {
    return queryTenant;
  }

  const host = input.host?.split(":")[0]?.toLowerCase() ?? "";
  const [firstLabel] = host.split(".");

  if (
    firstLabel &&
    host.includes(".") &&
    !RESERVED_HOST_LABELS.has(firstLabel)
  ) {
    return normalizeTenantSlug(firstLabel);
  }

  return normalizeTenantSlug(process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG);
}

export function normalizeTenantSlug(value?: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";

  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : "";
}
