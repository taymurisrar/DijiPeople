import { StandardModuleRecordPage } from "@/app/components/runtime";
import type { ApprovalRequestItem } from "@/app/components/approvals/approval-types";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { approvalRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";

type PageProps = {
  params: Promise<{ approvalId: string }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function ApprovalDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [{ approvalId }, resolvedSearchParams, sessionUser] = await Promise.all(
    [
      params,
      searchParams ?? Promise.resolve({} as { formId?: string }),
      getSessionUser(),
    ],
  );
  const approval = await apiRequestJson<ApprovalRequestItem>(
    `/approvals/${approvalId}`,
  );
  const runtime = buildStandardRouteRuntime({
    pageKind: "detail",
    recordId: approval.id,
    sessionUser,
    spec: approvalRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );

  return (
    <main className="grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="read"
        record={{
          ...approval,
          approvalName: approval.title || approval.requestNumber || approval.id,
          moduleLabel: approval.moduleKey,
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
        }}
        recordId={approval.id}
        runtime={runtime}
        spec={approvalRuntimeSpec}
        title={approval.title}
      />
    </main>
  );
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
