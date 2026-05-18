import { apiRequestJson } from "@/lib/server-api";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SharedLookupOption } from "@/app/(authenticated)/_components/documents/types";
import { LeaveRequestForm } from "../_components/leave-request-form";
import { AvailableLeaveTypesResponse } from "../types";
import { ModuleFallbackState } from "../../_components/module-fallback-state";

export const dynamic = "force-dynamic";

export default async function NewLeaveRequestPage() {
  const sessionUser = await getSessionUser();
  const canCreateLeave = hasPermission(
    sessionUser?.permissionKeys,
    PERMISSION_KEYS.LEAVE_REQUESTS_CREATE,
  );
  const [availability, documentTypes, documentCategories] = await Promise.all([
    apiRequestJson<AvailableLeaveTypesResponse>(
      "/leave-requests/available-types",
    ).catch(
      (error) => {
        console.error("available leave types failed", error);
        return null;
      },
    ),
    apiRequestJson<SharedLookupOption[]>("/lookups/document-types").catch(
      () => [],
    ),
    apiRequestJson<SharedLookupOption[]>("/lookups/document-categories").catch(
      () => [],
    ),
  ]);

  return (
    <main className="grid gap-6">
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Leave Request
        </p>
        <h3 className="mt-3 text-3xl font-semibold text-foreground">
          Submit a leave request
        </h3>
        <p className="mt-2 max-w-3xl text-muted">
          Keep the first version practical: choose the leave type, define the
          date range, and let the approval matrix route the request.
        </p>
      </section>

      {!canCreateLeave ? (
        <ModuleFallbackState
          eyebrow="Leave request unavailable"
          title="You do not have permission to create leave requests."
          description="Your current role does not include self-service leave request creation."
          actionHref="/leaves"
          actionLabel="Back to leaves"
        />
      ) : !availability ? (
        <ModuleFallbackState
          eyebrow="Leave setup incomplete"
          title="Leave setup is incomplete."
          description="The leave request setup could not be resolved for your profile. Please contact an administrator."
          actionHref="/leaves"
          actionLabel="Back to leaves"
        />
      ) : availability.status === "NO_APPLICABLE_POLICY" ? (
        <ModuleFallbackState
          eyebrow="Leave policy needed"
          title="No applicable leave policy is assigned to you."
          description="An administrator needs to assign an active leave policy to your tenant scope before you can submit a request."
          actionHref="/leaves"
          actionLabel="Back to leaves"
        />
      ) : availability.status === "NO_ACTIVE_TYPES" ? (
        <ModuleFallbackState
          eyebrow="Leave setup needed"
          title="No active leave types are available under your leave policy."
          description="Your leave policy is assigned, but it does not currently contain any active leave type rules."
          actionHref="/leaves"
          actionLabel="Back to leaves"
        />
      ) : (
        <LeaveRequestForm
          documentCategories={documentCategories}
          documentTypes={documentTypes}
          leaveTypes={availability.leaveTypes}
        />
      )}
    </main>
  );
}
