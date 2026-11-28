import { apiRequestJson } from "@/lib/server-api";
import { buildMyWorkItemsQuery, type LinkableWorkItem } from "./work-item-link";

/**
 * The viewer's own work items, for linking a timesheet entry. A nicety: a tenant
 * without work management, or an account without access, simply gets none and
 * the entry keeps its free-text task, so a failure is an empty list.
 */
export async function loadMyWorkItems(): Promise<LinkableWorkItem[]> {
  const page = await apiRequestJson<{ items?: LinkableWorkItem[] }>(
    `/work-items?${buildMyWorkItemsQuery()}`,
  ).catch((): { items?: LinkableWorkItem[] } => ({ items: [] }));
  return page.items ?? [];
}
