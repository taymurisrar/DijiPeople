import { requireSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { ContributionsManager } from "../_components/contributions-manager";
import {
  buildContributionsQuery,
  buildSummaryQuery,
  weekRange,
  type ContributionPage,
  type ContributionSummary,
} from "../_lib/contributions";

export default async function MyEvidencePage() {
  const user = await requireSessionUser("/work/contributions");
  if (!hasPermission(user.permissionKeys, PERMISSION_KEYS.CONTRIBUTIONS_READ)) {
    return <AccessDeniedState />;
  }

  const week = weekRange();
  const [summary, page] = await Promise.all([
    apiRequestJson<ContributionSummary>(
      `/contributions/summary?${buildSummaryQuery(week)}`,
    ),
    apiRequestJson<ContributionPage>(
      `/contributions?${buildContributionsQuery(week)}`,
    ),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Work
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          My evidence
        </h2>
      </section>
      <ContributionsManager
        canWrite={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.CONTRIBUTIONS_WRITE,
        )}
        initialEntries={page.items ?? []}
        initialSummary={summary}
        initialWeek={week}
      />
    </div>
  );
}
