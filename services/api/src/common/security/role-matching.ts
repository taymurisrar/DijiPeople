const ROLE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'global-admin': ['global-administrator', 'global-administrator-role'],
  'global-administrator': ['global-admin'],
  'system-admin': ['system-administrator', 'system-administrator-role'],
  'system-administrator': ['system-admin'],
  hr: [],
  'hr-manager': [],
};

export function normalizeRole(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

export function hasAnyRole(
  userRoles: readonly string[],
  allowedRoles: readonly string[],
) {
  const allowed = new Set(allowedRoles.flatMap((role) => roleVariants(role)));

  return userRoles.some((role) =>
    roleVariants(role).some((variant) => allowed.has(variant)),
  );
}

function roleVariants(value: string) {
  const normalized = normalizeRole(value);
  return [normalized, ...(ROLE_ALIASES[normalized] ?? [])];
}
