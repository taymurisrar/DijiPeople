import { API_ERROR_HANDLING_HEADER } from "@/lib/api-error";
import type { EmailTemplateScopeLevel, ScopeTarget } from "./notifications-api";

export type WorkflowStatus = "DRAFT" | "ACTIVE" | "INACTIVE";
export type WorkflowRecipientMode = "SUBJECT" | "ACTOR" | "FIXED";

export type WorkflowCondition = {
  field: string;
  operator: string;
  value?: string | null;
};

export type WorkflowAction = {
  id?: string;
  type: "SEND_EMAIL";
  sortOrder: number;
  isActive: boolean;
  templateId: string | null;
  templateKey: string | null;
  recipientMode: WorkflowRecipientMode;
  recipientAddress: string | null;
};

export type Workflow = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  eventCode: string;
  status: WorkflowStatus;
  moduleKey: string | null;
  scopeKey: string;
  scopeLevel: EmailTemplateScopeLevel | "SYSTEM";
  scopeId: string | null;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  runCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRun = {
  id: string;
  eventCode: string;
  status: "SUCCEEDED" | "FAILED" | "SKIPPED";
  startedAt: string;
  finishedAt: string | null;
  actionsRun: number;
  error: string | null;
};

export type WorkflowBuilderOptions = {
  levels: { value: EmailTemplateScopeLevel; label: string }[];
  organizations: ScopeTarget[];
  businessUnits: (ScopeTarget & { organizationId: string | null })[];
  departments: (ScopeTarget & { businessUnitId: string | null })[];
  teams: (ScopeTarget & { departmentId: string | null })[];
  modules: { value: string; label: string }[];
  events: {
    value: string;
    label: string;
    description: string | null;
    category: string;
  }[];
  templates: {
    value: string;
    label: string;
    eventCode: string;
    templateKey: string;
    scopeLevel: string;
  }[];
  conditionOperators: { value: string; label: string }[];
  recipientModes: { value: WorkflowRecipientMode; label: string }[];
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/workflows${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      [API_ERROR_HANDLING_HEADER]: "inline",
      ...(init?.headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => null)) as
    | { message?: string }
    | T
    | null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? data.message
        : undefined;
    throw new Error(message ?? "The workflow request failed.");
  }

  return data as T;
}

export const getWorkflows = () =>
  requestJson<{ items: Workflow[] }>("");
export const getWorkflowBuilderOptions = () =>
  requestJson<WorkflowBuilderOptions>("/builder-options");
export const getWorkflow = (id: string) => requestJson<Workflow>(`/${id}`);
export const getWorkflowRuns = (id: string) =>
  requestJson<{ items: WorkflowRun[] }>(`/${id}/runs`);
export const createWorkflow = (body: unknown) =>
  requestJson<Workflow>("", { method: "POST", body: JSON.stringify(body) });
export const updateWorkflow = (id: string, body: unknown) =>
  requestJson<Workflow>(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
export const deleteWorkflow = (id: string) =>
  requestJson<{ deleted: boolean }>(`/${id}`, { method: "DELETE" });
