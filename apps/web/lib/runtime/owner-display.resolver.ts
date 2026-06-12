import type { ModuleOwnerOption } from "./module-data-adapter.types";
import type { RuntimePrincipal } from "./security-runtime.types";

export type OwnerDisplayRecord = Readonly<Record<string, unknown>>;

export interface NormalizedOwnerOption {
  readonly id: string;
  readonly name: string;
  readonly email?: string | null;
  readonly subtitle?: string | null;
  readonly code?: string | null;
  readonly roleKeys?: readonly string[];
}

export function normalizeOwnerOption(
  option: ModuleOwnerOption,
): NormalizedOwnerOption {
  const id = stringValue(option.id) || stringValue(option.value);
  const email = stringValue(option.email) || stringValue(option.subtitle);
  const name =
    stringValue(option.name) ||
    stringValue(option.label) ||
    stringValue(option.displayName) ||
    email ||
    id;

  return {
    id,
    name,
    email: email || null,
    subtitle: stringValue(option.subtitle) || email || null,
    code: stringValue(option.code) || null,
    roleKeys: option.roleKeys,
  };
}

export function resolveOwnerDisplayName({
  lookupDisplayValue,
  ownerId,
  ownerOptions,
  principal,
  record,
}: {
  readonly lookupDisplayValue?: string | null;
  readonly ownerId?: string | null;
  readonly ownerOptions?: readonly ModuleOwnerOption[];
  readonly principal?: RuntimePrincipal | null;
  readonly record?: OwnerDisplayRecord | null;
}) {
  const resolvedOwnerId = ownerId?.trim();
  const explicitDisplay = stringValue(lookupDisplayValue);

  if (explicitDisplay && !isGuidLike(explicitDisplay)) return explicitDisplay;
  if (!resolvedOwnerId) return "Not set";

  if (principal?.userId === resolvedOwnerId) {
    return principalDisplayName(principal) ?? "Current user";
  }

  const option = (ownerOptions ?? [])
    .map(normalizeOwnerOption)
    .find((candidate) => candidate.id === resolvedOwnerId);
  if (option) return option.name || option.email || "Unknown owner";

  const recordDisplay =
    stringValue(record?.ownerDisplayName) ||
    stringValue(record?.ownerName) ||
    stringValue(record?.ownerEmail);

  if (recordDisplay && !isGuidLike(recordDisplay)) return recordDisplay;

  return "Unknown owner";
}

export function principalDisplayName(principal?: RuntimePrincipal | null) {
  if (!principal) return null;

  return (
    stringValue(principal.displayName) ||
    stringValue(principal.name) ||
    stringValue(principal.email) ||
    null
  );
}

export function isGuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
