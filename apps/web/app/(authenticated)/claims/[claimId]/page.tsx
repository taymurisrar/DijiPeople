import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { withRouteCustomFields } from "@/lib/runtime/custom-fields-server";
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
import { AccessDeniedState } from "../../_components/access-denied-state";
import { ClaimRecordPage } from "../_components/claim-record-page";
import type { ClaimRecord } from "../claim-types";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ClaimDetailPage({ params }: PageProps) {
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
  const runtime = await withRouteCustomFields(
    buildStandardRouteRuntime({
      pageKind: "detail",
      recordId: claim.id,
      sessionUser: user,
      spec: claimRuntimeSpec,
    }),
  );
  return (
    <div className="grid gap-6">
      <ClaimRecordPage
        activeForm={resolveStandardActiveForm(runtime.metadata.forms, "")}
        mode="read"
        record={toClaimRuntimeRecord(claim)}
        recordId={claim.id}
        runtime={runtime}
        surface="admin"
        title={claim.title}
      />
    </div>
  );
}
