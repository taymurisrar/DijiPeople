import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { withRouteCustomFields } from "@/lib/runtime/custom-fields-server";
import { isClaimEditable } from "@/lib/runtime/modules/claim-editor";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import {
  myClaimRuntimeSpec,
  toClaimRuntimeRecord,
} from "@/lib/runtime/modules/claims-runtime-specs";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../../../_components/access-denied-state";
import { ClaimRecordPage } from "../../../../claims/_components/claim-record-page";
import type { ClaimRecord } from "../../../../claims/claim-types";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function EditMyClaimPage({ params }: PageProps) {
  const [{ claimId }, user] = await Promise.all([params, getSessionUser()]);
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_READ_OWN)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to this claim."
      />
    );
  }
  const claim = await apiRequestJson<ClaimRecord>(
    `/me/claims/${encodeURIComponent(claimId)}`,
  );
  /* Every self-service write route is guarded by claims.create, not update. */
  const canEdit =
    hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_CREATE) &&
    isClaimEditable(claim.status);
  const runtime = await withRouteCustomFields(
    buildStandardRouteRuntime({
      pageKind: canEdit ? "edit" : "detail",
      recordId: claim.id,
      sessionUser: user,
      spec: myClaimRuntimeSpec,
    }),
  );
  return (
    <div className="grid gap-6">
      <ClaimRecordPage
        activeForm={resolveStandardActiveForm(runtime.metadata.forms, "")}
        canEditLineItems={canEdit}
        mode={canEdit ? "edit" : "read"}
        record={toClaimRuntimeRecord(claim)}
        recordId={claim.id}
        runtime={runtime}
        surface="self"
        title={claim.title}
      />
    </div>
  );
}
