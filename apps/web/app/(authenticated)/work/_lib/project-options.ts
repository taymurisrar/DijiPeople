import { apiRequestJson } from "@/lib/server-api";

type ProjectRow = { id: string; name: string };

/**
 * The projects the caller can read, for pickers. A nicety: a screen works without
 * it, so a failure (or an account with no projects access) is an empty list.
 */
export async function loadProjectOptions(): Promise<ProjectRow[]> {
  const response = await apiRequestJson<
    ProjectRow[] | { items?: ProjectRow[] }
  >("/projects").catch((): ProjectRow[] => []);
  const rows = Array.isArray(response) ? response : (response.items ?? []);
  return rows.map((project) => ({ id: project.id, name: project.name }));
}
