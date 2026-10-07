import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { withRouteCustomFields } from "@/lib/runtime/custom-fields-server";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { myClaimRuntimeSpec } from "@/lib/runtime/modules/claims-runtime-specs";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { ClaimRecordPage } from "../../../claims/_components/claim-record-page";
import { loadDefaultClaimCurrency } from "../../../claims/default-claim-currency";

export default async function NewMyClaimPage() {
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_CREATE)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to create claims."
      />
    );
  }
  const [runtime, currencyCode] = await Promise.all([
    withRouteCustomFields(
      buildStandardRouteRuntime({
        pageKind: "create",
        sessionUser: user,
        spec: myClaimRuntimeSpec,
      }),
    ),
    loadDefaultClaimCurrency(),
  ]);
  return (
    <div className="grid gap-6">
      <ClaimRecordPage
        activeForm={resolveStandardActiveForm(
          runtime.metadata.forms,
          "",
          "quickCreate",
        )}
        mode="create"
        record={{ currencyCode }}
        runtime={runtime}
        surface="self"
        title="New claim"
      />
    </div>
  );
}
