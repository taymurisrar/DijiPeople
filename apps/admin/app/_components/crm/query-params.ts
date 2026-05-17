"use client";

export function buildNextQuery(
  pathname: string,
  updates: Record<string, string | undefined | null>,
) {
  const search = new URLSearchParams(window.location.search);

  for (const [key, value] of Object.entries(updates)) {
    if (value) search.set(key, value);
    else search.delete(key);
  }

  if (!("page" in updates)) {
    search.delete("page");
  }

  return `${pathname}${search.toString() ? `?${search.toString()}` : ""}`;
}
