import { apiRequestJson } from "@/lib/server-api";
import {
  RecruitmentPipelineListResponse,
  RecruitmentPipelineRecord,
} from "../types";
import { RecruitmentPipelineManager } from "./recruitment-pipeline-manager";

export default async function RecruitmentPipelinesPage() {
  const response =
    await apiRequestJson<RecruitmentPipelineListResponse>(
      "/recruitment/pipelines",
    );

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,248,245,0.9))] p-8 shadow-lg">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Recruitment
        </p>
        <h3 className="mt-3 font-serif text-4xl text-foreground">
          Recruitment Pipelines
        </h3>
        <p className="mt-3 max-w-3xl text-muted">
          Configure hiring workflows, ordered stages, terminal outcomes, and
          default pipeline behavior for job openings.
        </p>
      </section>

      <RecruitmentPipelineManager
        initialPipelines={(response.items ?? []) as RecruitmentPipelineRecord[]}
      />
    </div>
  );
}
