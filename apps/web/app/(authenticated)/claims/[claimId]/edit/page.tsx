import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { withRouteCustomFields } from "@/lib/runtime/custom-fields-server";
import { isClaimEditable } from "@/lib/runtime/modules/claim-editor";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import {
  claimRuntimeSpec,
  toClaimRuntimeRecord,
} from "@/lib/runtime/modules/claims-runtime-specs";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { ClaimRecordPage } from "../../_components/claim-record-page";
import type { ClaimRecord } from "../../claim-types";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function EditClaimPage({ params }: PageProps) {
  const [{ claimId }, user] = await Promise.all([params, getSessionUser()]);
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_READ_ALL)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to claims."
      />
    );
  }
  const claim = await apiRequestJson<ClaimRecord>(
    `/claims/${encodeURIComponent(claimId)}`,
  );
  /*
   * As before the migration: anyone who may read claims may open this route,
   * but only claims.update on a DRAFT claim may change anything. Everyone
   * else gets the same record read-only, not a form the API would refuse.
   */
  const canEdit =
    hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_UPDATE) &&
    isClaimEditable(claim.status);
  const runtime = await withRouteCustomFields(
    buildStandardRouteRuntime({
      pageKind: canEdit ? "edit" : "detail",
      recordId: claim.id,
      sessionUser: user,
      spec: claimRuntimeSpec,
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
        surface="admin"
        title={claim.title}
      />
    </div>
  );
}
