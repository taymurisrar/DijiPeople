import { messageFromErrorBody } from "./work-profile-form";

export type VersionStatus = "DRAFT" | "PUBLISHED";

export type WorkProfileVersionSummary = {
  id: string;
  version: number;
  status: VersionStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type WorkProfileListItem = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  currentVersion: WorkProfileVersionSummary | null;
  hasDraft: boolean;
};

export type WorkProfileVersion = WorkProfileVersionSummary & {
  definition: unknown;
  publishedAt: string | null;
  createdAt: string;
};

export type WorkProfileDetail = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  versions: WorkProfileVersion[];
};

export type WorkAssignment = {
  id: string;
  employeeId: string;
  profileId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  profile?: { key: string; name: string };
};

export type EmployeeOption = { id: string; name: string; code: string };

export type ImportItem = {
  key: string;
  action: "create" | "new-version" | "unchanged";
};

export type ExportedPackage = {
  fileName: string;
  checksum: string;
  content: string;
};

/**
 * One call into the thin `/api/work-profiles` proxy. The API is the authority on
 * permission and tenant scope; a failure surfaces as its own message.
 */
export async function workProfilesRequest<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`/api/work-profiles${path}`, {
    method: init.method ?? "GET",
    cache: "no-store",
    headers:
      init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      messageFromErrorBody(
        body,
        response.status === 403
          ? "You do not have permission to do that."
          : "The request failed. Try again.",
      ),
    );
  }
  return body as T;
}
