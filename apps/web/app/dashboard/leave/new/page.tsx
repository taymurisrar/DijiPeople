import { apiRequestJson } from "@/lib/server-api";
import { SharedLookupOption } from "@/app/dashboard/_components/documents/types";
import { LeaveRequestForm } from "../_components/leave-request-form";
import { LeaveTypeOption } from "../types";

export const dynamic = "force-dynamic";

export default async function NewLeaveRequestPage() {
  const [leaveTypes, documentTypes, documentCategories] = await Promise.all([
    apiRequestJson<LeaveTypeOption[]>("/leave-types?isActive=true").catch(
      (error) => {
        console.error("leave-types failed", error);
        return [];
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

      {leaveTypes.length === 0 ? (
        <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          Leave types could not be loaded for this user.
        </div>
      ) : (
        <LeaveRequestForm
          documentCategories={documentCategories}
          documentTypes={documentTypes}
          leaveTypes={leaveTypes}
        />
      )}
    </main>
  );
}