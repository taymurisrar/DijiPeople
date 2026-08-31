import { StandardModuleListPage } from "@/app/components/runtime";
import { moduleDisplayName } from "@/app/components/approvals/approval-display";
import type { ApprovalsResponse } from "@/app/components/approvals/approval-types";
import { requireSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import {
  buildStandardModuleRuntimeContext,
  buildStandardRuntimePrincipal,
} from "@/lib/runtime/modules/standard-module-runtime";
import { approvalRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../_components/access-denied-state";

type ApprovalsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const APPROVAL_PERMISSIONS = [
  PERMISSION_KEYS.APPROVALS_READ,
  PERMISSION_KEYS.APPROVALS_READ_OWN,
  PERMISSION_KEYS.APPROVALS_READ_ASSIGNED,
  PERMISSION_KEYS.APPROVALS_READ_TEAM,
  PERMISSION_KEYS.APPROVALS_MANAGE,
];

export default async function ApprovalsPage({
  searchParams,
}: ApprovalsPageProps) {
  const user = await requireSessionUser("/");
  if (!hasAnyPermission(user.permissionKeys, APPROVAL_PERMISSIONS)) {
    return <AccessDeniedState />;
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = buildQuery(resolvedSearchParams);
  const response = await apiRequestJson<ApprovalsResponse>(
    `/approvals${query ? `?${query}` : ""}`,
  );
  const runtime = buildStandardModuleRuntimeContext({
    pageKind: "list",
    principal: buildStandardRuntimePrincipal({
      userId: user.userId,
      tenantId: user.tenantId,
      roleKeys: user.roleKeys,
      roles: user.roles,
      permissionKeys: user.permissionKeys,
    }),
    spec: approvalRuntimeSpec,
  });
  const activeView = resolveActiveView(
    runtime,
    getSearchParam(resolvedSearchParams.viewId),
  );
  const records = response.items.map((approval) => ({
    ...approval,
    approvalName: approval.title || approval.requestNumber || approval.id,
    moduleLabel: moduleDisplayName(approval.moduleKey),
    requesterName:
      fullName(approval.submittedByUser) ||
      fullName(approval.submittedForEmployee) ||
      "Unknown requester",
    assignedToName:
      approval.currentStep?.assignments
        .map((assignment) =>
          assignment.assignedToUser
            ? fullName(assignment.assignedToUser)
            : assignment.assignedToRole?.name,
        )
        .filter(Boolean)
        .join(", ") ?? "",
    submittedAt: approval.submittedAtUtc,
  }));

  return (
    <div className="space-y-6">
      <StandardModuleListPage
        activeView={activeView}
        formatting={{
          dateFormat: "MM/dd/yyyy",
          locale: "en-US",
          timezone: "UTC",
        }}
        pagination={{
          page: response.page,
          pageSize: response.pageSize,
          totalItems: response.total,
          pathname: approvalRuntimeSpec.routeBase,
          searchParams: {
            viewId: activeView?.viewId ?? activeView?.id,
          },
        }}
        records={records}
        runtime={runtime}
        title="Approvals"
      />
    </div>
  );
}

function buildQuery(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === "viewId") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item));
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }

  return search.toString();
}

function resolveActiveView(
  runtime: ReturnType<typeof buildStandardModuleRuntimeContext>,
  viewId: string,
) {
  return (
    runtime.metadata.views.find(
      (view) => (view.viewId ?? view.id) === viewId,
    ) ??
    runtime.metadata.views.find((view) => view.isDefault) ??
    runtime.metadata.views[0] ??
    null
  );
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function fullName(
  user:
    | {
        readonly firstName: string;
        readonly lastName: string;
      }
    | null
    | undefined,
) {
  if (!user) return "";
  return [user.firstName, user.lastName].filter(Boolean).join(" ");
}
