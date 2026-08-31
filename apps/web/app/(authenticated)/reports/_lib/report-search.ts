import type { ReportLibraryEntry } from "./reporting-types";

/*
 * Finding a report, and grouping the ones you found.
 *
 * Pure and separate from the component for the usual reason in this app: jest
 * here is node-only and matches `*.spec.ts`, so a `.tsx` is untestable and a
 * `.ts` is not. Search and grouping are also exactly the sort of thing that
 * looks obviously right and quietly is not — a term that matches the category
 * but not the name, an uncategorised report vanishing from a grouped list.
 */

/**
 * Does this report match what was typed?
 *
 * Every term must match *something* — name, description or category — rather
 * than all of them matching one field. "attendance monthly" then finds a report
 * called "Monthly summary" in the Attendance category, which is what a person
 * typing those two words means. Requiring one field to contain both would find
 * nothing and read as a broken search.
 *
 * An empty or whitespace-only term matches everything, so a cleared box shows
 * the full library rather than nothing.
 */
export function matchesReportSearch(
  entry: ReportLibraryEntry,
  search: string,
): boolean {
  const terms = search
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) return true;

  const haystack = [entry.name, entry.description, entry.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

export type ReportCategoryGroup = {
  category: string;
  entries: ReportLibraryEntry[];
};

/** Reports with no category of their own. */
export const UNCATEGORISED_LABEL = "Other reports";

/**
 * Group by category, alphabetically, with the uncategorised bucket last.
 *
 * A report whose `category` is empty is put in a named bucket rather than one
 * called `""`, which renders as a heading-shaped blank and reads as a rendering
 * fault. Last rather than first because it is the least specific group and a
 * reader scanning headings should meet the meaningful ones first.
 */
export function groupByCategory(
  entries: readonly ReportLibraryEntry[],
): ReportCategoryGroup[] {
  const groups = new Map<string, ReportLibraryEntry[]>();

  for (const entry of entries) {
    const category = entry.category?.trim() || UNCATEGORISED_LABEL;
    const bucket = groups.get(category);
    if (bucket) bucket.push(entry);
    else groups.set(category, [entry]);
  }

  return [...groups.entries()]
    .map(([category, grouped]) => ({
      category,
      entries: [...grouped].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (a.category === UNCATEGORISED_LABEL) return 1;
      if (b.category === UNCATEGORISED_LABEL) return -1;
      return a.category.localeCompare(b.category);
    });
}
