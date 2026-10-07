import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import {
  claimRuntimeSpec,
  toClaimRuntimeRecord,
} from "@/lib/runtime/modules/claims-runtime-specs";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import type { ClaimRecord } from "./claim-types";

export default async function ClaimsPage() {
  const user = await getSessionUser();
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
  const claims = await apiRequestJson<ClaimRecord[]>("/claims");
  const runtime = buildStandardRouteRuntime({
    pageKind: "list",
    sessionUser: user,
    spec: claimRuntimeSpec,
  });
  return (
    <div className="grid gap-6">
      <StandardModuleListPage
        records={claims.map(toClaimRuntimeRecord)}
        runtime={runtime}
        spec={claimRuntimeSpec}
        title="Claims & Reimbursements"
      />
    </div>
  );
}
