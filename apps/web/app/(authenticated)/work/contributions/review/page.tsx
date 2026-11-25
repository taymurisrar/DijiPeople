import { requireSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { ContributionReviewManager } from "../../_components/contribution-review-manager";
import { loadEmployeeOptions } from "../../_lib/employee-options";
import {
  buildContributionsQuery,
  type ContributionPage,
} from "../../_lib/contributions";

export default async function EvidenceReviewPage() {
  const user = await requireSessionUser("/work/contributions/review");
  if (
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.CONTRIBUTIONS_VERIFY)
  ) {
    return <AccessDeniedState />;
  }

  const [page, people] = await Promise.all([
    apiRequestJson<ContributionPage>(
      `/contributions?${buildContributionsQuery({ verification: "UNVERIFIED" })}`,
    ),
    loadEmployeeOptions(),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Work
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Evidence review
        </h2>
      </section>
      <ContributionReviewManager
        initialEntries={page.items ?? []}
        people={people}
      />
    </div>
  );
}
