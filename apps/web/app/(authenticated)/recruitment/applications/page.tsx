import { getSessionUser } from "@/lib/auth";
import { buildPublishedStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { recruitmentApplicationRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../../_lib/business-unit-access";
import { RecruitmentApplicationsRuntimeList } from "../_components/recruitment-applications-runtime-list";
import {
  ApplicationListResponse,
  CandidateListResponse,
  JobOpeningListResponse,
  RecruitmentPipelineListResponse,
} from "../types";

export default async function RecruitmentApplicationsPage() {
  const [businessUnitAccess, sessionUser] = await Promise.all([
    getBusinessUnitAccessSummary(),
    getSessionUser(),
  ]);

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include recruitment applications."
          title="Applications are unavailable for your current business unit access."
        />
      </main>
    );
  }

  const [applications, candidates, jobs, pipelines, runtime] =
    await Promise.all([
      apiRequestJson<ApplicationListResponse>("/applications?pageSize=100"),
      apiRequestJson<CandidateListResponse>("/candidates?pageSize=100"),
      apiRequestJson<JobOpeningListResponse>("/job-openings?pageSize=100"),
      apiRequestJson<RecruitmentPipelineListResponse>("/recruitment/pipelines"),
      buildPublishedStandardRouteRuntime({
        pageKind: "list",
        sessionUser,
        spec: recruitmentApplicationRuntimeSpec,
      }),
    ]);

  return (
    <main className="dp-theme-scope grid gap-6">
      <RecruitmentApplicationsRuntimeList
        applications={applications.items}
        candidates={candidates.items}
        jobs={jobs.items}
        pipeline={
          pipelines.items.find((item) => item.isDefault) ?? pipelines.items[0]
        }
        runtime={runtime}
      />
    </main>
  );
}
