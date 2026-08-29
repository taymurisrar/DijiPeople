import { StandardModuleRecordPage } from "@/app/components/runtime";
import { TopAlert } from "@/app/components/notifications/top-alert";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { leaveRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import type { AvailableLeaveTypesResponse } from "../types";

type PageProps = {
  searchParams?: Promise<{ formId?: string }>;
};

export default async function NewLeavePage({ searchParams }: PageProps) {
  const [resolvedSearchParams, sessionUser, leaveTypeConfig] =
    await Promise.all([
      searchParams ?? Promise.resolve({} as { formId?: string }),
      getSessionUser(),
      apiRequestJson<AvailableLeaveTypesResponse>(
        "/leave-requests/available-types",
      ).catch((error: unknown) => ({
        status: "ERROR" as const,
        leaveTypes: [],
        diagnostic:
          error instanceof Error
            ? `Leave Types could not be loaded: ${error.message}`
            : "Leave Types could not be loaded.",
      })),
    ]);
  const runtime = buildStandardRouteRuntime({
    pageKind: "create",
    sessionUser,
    spec: leaveRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );

  return (
    <div className="dp-theme-scope dp-leaves-scope grid gap-6">
      {leaveTypeConfig.status !== "AVAILABLE" ? (
        <TopAlert
          description={
            leaveTypeConfig.status === "NO_ACTIVE_TYPES"
              ? "No active Leave Types are configured. Configure Leave Types in Settings."
              : (leaveTypeConfig.diagnostic ??
                "Leave Types could not be loaded. Review Leave settings and try again.")
          }
          title="Leave configuration is incomplete"
          variant="warning"
        />
      ) : null}
      <StandardModuleRecordPage
        activeForm={activeForm}
        lookupOptions={{
          leaveTypeId: leaveTypeConfig.leaveTypes.map((leaveType) => ({
            id: leaveType.id,
            name: `${leaveType.name} (${leaveType.code})`,
            subtitle: leaveType.category,
          })),
        }}
        mode="create"
        record={{ status: "PENDING" }}
        runtime={runtime}
        spec={leaveRuntimeSpec}
        title="New Leave Request"
      />
    </div>
  );
}
