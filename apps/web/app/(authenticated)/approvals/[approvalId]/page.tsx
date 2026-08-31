import { StandardModuleRecordPage } from "@/app/components/runtime";
import { ApprovalChain } from "@/app/components/approvals/approval-chain";
import { moduleDisplayName } from "@/app/components/approvals/approval-display";
import { buildApprovalRecord } from "@/app/components/approvals/approval-record";
import type { ApprovalDetailResponse } from "@/app/components/approvals/approval-types";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { approvalRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { RecordNotFoundState } from "@/app/(authenticated)/_components/record-not-found-state";

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
  /*
   * BUG-2004 — `/approvals/new` has no page of its own and is matched by this
   * route with `approvalId === "new"`, so this fetch 404s. It used to throw
   * uncaught inside a Server Component, which React turns into a stripped
   * Flight error row and the boundary renders as "UNEXPECTED ERROR" (BUG-2013).
   * A record that is not there is a not-found state, not a crash — for a stale
   * link or a hand-typed URL just as much as for the "new" segment.
   */
  let approval: ApprovalDetailResponse["item"];
  try {
    /*
     * BUG-2695 — `GET /approvals/:id` answers `{ item: {...} }` while
     * `GET /approvals` answers a bare list, and this page was typed as the bare
     * record. Every read below therefore came off the envelope and was
     * `undefined`: Approval, Module and Assigned To rendered empty and Requester
     * fell through to its "Unknown requester" fallback, on a record whose row in
     * the list one click earlier showed all four correctly.
     */
    const response = await apiRequestJson<ApprovalDetailResponse>(
      `/approvals/${approvalId}`,
    );
    approval = response.item;
  } catch (error: unknown) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 404 || error.status === 400)
    ) {
      /*
       * A div, not a main: the authenticated layout owns the single `main`
       * landmark (BUG-1951), and a second one here would give the page two.
       */
      return (
        <div className="grid gap-6">
          <RecordNotFoundState
            title="This approval was not found."
            description="Approvals are raised by other modules and cannot be created here. The request may have been withdrawn, or the link may be out of date."
            actionHref="/approvals"
            actionLabel="Back to approvals"
          />
        </div>
      );
    }

    throw error;
  }
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

  const moduleLabel = moduleDisplayName(approval.moduleKey);

  return (
    <div className="grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="read"
        record={buildApprovalRecord(approval)}
        recordId={approval.id}
        runtime={runtime}
        spec={approvalRuntimeSpec}
        title={approval.title}
      />
      <ApprovalChain approval={approval} moduleLabel={moduleLabel} />
    </div>
  );
}
