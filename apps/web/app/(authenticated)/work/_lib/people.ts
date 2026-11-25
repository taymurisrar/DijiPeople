/*
 * A person the screens can name. The API returns employee ids on work,
 * contribution and update rows; names come from the employee list the caller is
 * already allowed to read, so the picker never offers someone out of reach.
 */
export type PersonOption = { id: string; name: string; code?: string };

export function personLabel(
  people: readonly PersonOption[],
  id: string | null | undefined,
): string {
  if (!id) return "Unassigned";
  return people.find((p) => p.id === id)?.name ?? `Employee ${id.slice(0, 8)}`;
}

export function personSelectOptions(
  people: readonly PersonOption[],
): { value: string; label: string }[] {
  return people.map((p) => ({
    value: p.id,
    label: p.code ? `${p.name} (${p.code})` : p.name,
  }));
}
