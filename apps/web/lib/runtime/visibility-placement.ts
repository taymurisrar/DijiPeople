import type { VisibilityPrincipal } from "./visibility.resolver";

/*
 * Turns the signed-in person's employee record into the placement the
 * visibility operators match on.
 *
 * Without this the in-department / in-business-unit style rules could never
 * match, because the session payload carries roles but no placement. Read
 * defensively: the API sends business unit and organization, but the web
 * employee type does not declare every one of them, and a rule that silently
 * fails closed is better than a type assertion that lies.
 */

type PlacementSource = Record<string, unknown> | null | undefined;

export type VisibilityPlacement = Pick<
  VisibilityPrincipal,
  | "teamIds"
  | "departmentIds"
  | "businessUnitIds"
  | "organizationIds"
  | "designationIds"
>;

function readId(source: PlacementSource, ...paths: string[]): string | null {
  if (!source) return null;

  for (const path of paths) {
    let value: unknown = source;
    for (const segment of path.split(".")) {
      if (!value || typeof value !== "object") {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[segment];
    }
    if (typeof value === "string" && value.trim()) return value;
  }

  return null;
}

/* Each dimension is a list so a person can later belong to several. */
function ids(...values: (string | null)[]): readonly string[] | undefined {
  const present = values.filter((value): value is string => Boolean(value));
  return present.length ? present : undefined;
}

export function buildVisibilityPlacement(
  employee: PlacementSource,
): VisibilityPlacement {
  return {
    teamIds: ids(readId(employee, "teamId", "team.id")),
    departmentIds: ids(readId(employee, "departmentId", "department.id")),
    businessUnitIds: ids(
      readId(employee, "businessUnitId", "businessUnit.id"),
    ),
    organizationIds: ids(
      readId(employee, "organizationId", "organization.id"),
    ),
    designationIds: ids(readId(employee, "designationId", "designation.id")),
  };
}
