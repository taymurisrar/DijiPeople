"use client";

import { ModuleListPage } from "@/app/components/runtime/module-list-page";
import { createStandardModuleDataAdapter } from "@/lib/runtime/modules/standard-module-data.adapter";
import { recruitmentApplicationRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import { ApplicationForm } from "./application-form";
import { RecruitmentApplicationsBoard } from "./recruitment-applications-board";
import {
  ApplicationRecord,
  CandidateRecord,
  JobOpeningRecord,
  RecruitmentPipelineRecord,
  RecruitmentStage,
} from "../types";

type RecruitmentApplicationsRuntimeListProps = {
  applications: ApplicationRecord[];
  candidates: CandidateRecord[];
  jobs: JobOpeningRecord[];
  pipeline?: RecruitmentPipelineRecord;
  runtime: ModuleRuntimeContext;
};

const ACTIVE_STAGES: RecruitmentStage[] = [
  "APPLIED",
  "SCREENING",
  "SHORTLISTED",
  "INTERVIEW",
  "FINAL_REVIEW",
  "OFFER",
  "APPROVED",
];

export function RecruitmentApplicationsRuntimeList({
  applications,
  candidates,
  jobs,
  pipeline,
  runtime,
}: RecruitmentApplicationsRuntimeListProps) {
  const openJobs = jobs.filter(
    (job) => !["CLOSED", "FILLED", "Cancelled"].includes(job.status),
  );
  const activeApplications = applications.filter((application) =>
    ACTIVE_STAGES.includes(application.stage),
  ).length;
  const hiredApplications = applications.filter(
    (application) => application.stage === "HIRED",
  ).length;
  const averageMatch = average(
    applications
      .map((application) => application.matchScore)
      .filter((score): score is number => typeof score === "number"),
  );

  return (
    <ModuleListPage
      commandRecord={{
        applicationCount: applications.length,
        activeApplications,
        openJobs: openJobs.length,
      }}
      dataAdapter={createStandardModuleDataAdapter(
        recruitmentApplicationRuntimeSpec,
      )}
      listRecords={applications.map(mapApplicationRecord)}
      moduleKey={runtime.module.key}
      runtime={runtime}
      tableSlot={
        <div className="grid gap-4">
          <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-muted">
                  Pipeline
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  Move applications across hiring stages
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-muted">
                  Create applications, drag cards between stages, and open a
                  record for scoring, feedback, and audit history.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryMetric label="Total" value={applications.length} />
                <SummaryMetric label="Active" value={activeApplications} />
                <SummaryMetric label="Hired" value={hiredApplications} />
                <SummaryMetric
                  label="Avg match"
                  value={averageMatch == null ? "N/A" : `${averageMatch}%`}
                />
              </div>
            </div>
          </section>

          <ApplicationForm candidates={candidates} jobs={openJobs} />
          <RecruitmentApplicationsBoard
            applications={applications}
            pipelineStages={pipeline?.stages}
            requireRejectReason={pipeline?.requireRejectReason}
          />
        </div>
      }
      title="Recruitment Applications"
    />
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="min-w-[96px] rounded-lg border border-border bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function mapApplicationRecord(application: ApplicationRecord) {
  return {
    ...application,
    applicationName: application.candidate.fullName,
    candidateName: application.candidate.fullName,
    candidateEmail: application.candidate.email,
    jobTitle: application.jobOpening.title,
    jobCode: application.jobOpening.code ?? "",
    currentCity: application.candidate.currentCity ?? "",
    preferredWorkMode: application.candidate.preferredWorkMode ?? "",
  };
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round(
    values.reduce((total, value) => total + value, 0) / values.length,
  );
}
