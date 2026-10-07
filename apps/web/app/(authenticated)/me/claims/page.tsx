import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import {
  myClaimRuntimeSpec,
  toClaimRuntimeRecord,
} from "@/lib/runtime/modules/claims-runtime-specs";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import type { ClaimRecord } from "../../claims/claim-types";

export default async function MyClaimsPage() {
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_READ_OWN)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to your claims."
      />
    );
  }
  const claims = await apiRequestJson<ClaimRecord[]>("/me/claims");
  const runtime = buildStandardRouteRuntime({
    pageKind: "list",
    sessionUser: user,
    spec: myClaimRuntimeSpec,
  });
  return (
    <div className="grid gap-6">
      <StandardModuleListPage
        records={claims.map(toClaimRuntimeRecord)}
        runtime={runtime}
        spec={myClaimRuntimeSpec}
        title="My Claims"
      />
    </div>
  );
}
