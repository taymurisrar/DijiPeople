"use client";

import Link from "next/link";
import { Edit, FileText, Percent, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { JobOpeningStatusBadge } from "./job-opening-status-badge";
import { RecruitmentStageBadge } from "./recruitment-stage-badge";
import {
  ApplicationRecord,
  hasMatchCriteriaConfigured,
  JobOpeningMatchCriteria,
  JobOpeningRecord,
} from "../types";

type JobOpeningWithMatchCriteria = JobOpeningRecord & {
  matchCriteria?: JobOpeningMatchCriteria | null;
};

type JobOpeningDetailWorkspaceProps = {
  job: JobOpeningWithMatchCriteria;
};

export function JobOpeningDetailWorkspace({
  job,
}: JobOpeningDetailWorkspaceProps) {
  const matchCriteria = job.matchCriteria ?? null;
  const scoringConfigured = hasMatchCriteriaConfigured(matchCriteria);
  const averageMatchScore = getAverageMatchScore(job.applications);

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <JobOpeningStatusBadge status={job.status} />
              <ReadinessBadge ready={scoringConfigured} />
            </div>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">
              {job.description || "No job description added yet."}
            </p>
          </div>
          <Button
            href={`/recruitment/jobs/${job.id}/edit`}
            size="sm"
            variant="secondary"
            leftIcon={<Edit className="h-4 w-4" />}
          >
            Edit opening
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={<FileText className="h-4 w-4" />}
            label="Code"
            value={job.code || "No code"}
          />
          <Metric
            icon={<UsersRound className="h-4 w-4" />}
            label="Applications"
            value={`${job.applications.length}`}
          />
          <Metric
            icon={<Percent className="h-4 w-4" />}
            label="Scoring"
            value={scoringConfigured ? "Configured" : "Not configured"}
          />
          <Metric
            icon={<Percent className="h-4 w-4" />}
            label="Avg match"
            value={
              scoringConfigured && averageMatchScore !== null
                ? `${averageMatchScore}%`
                : "Unavailable"
            }
          />
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel eyebrow="Match configuration" title="Hiring criteria">
          {scoringConfigured && matchCriteria ? (
            <div className="grid gap-3">
              <CriteriaGroup
                title="Required skills"
                items={matchCriteria.requiredSkills}
                emptyLabel="No mandatory skills added."
                tone="strong"
              />
              <CriteriaGroup
                title="Preferred skills"
                items={matchCriteria.preferredSkills}
                emptyLabel="No preferred skills added."
              />
              <div className="grid gap-2 md:grid-cols-3">
                <Fact
                  label="Minimum experience"
                  value={
                    matchCriteria.minimumYearsExperience != null
                      ? `${matchCriteria.minimumYearsExperience} year(s)`
                      : "Not defined"
                  }
                />
                <Fact
                  label="Education levels"
                  value={listValue(matchCriteria.educationLevels)}
                />
                <Fact
                  label="Notice period"
                  value={
                    matchCriteria.noticePeriodDays != null
                      ? `${matchCriteria.noticePeriodDays} day(s)`
                      : "Not defined"
                  }
                />
                <CriteriaGroup
                  title="Allowed work modes"
                  items={matchCriteria.allowedWorkModes}
                  emptyLabel="No work mode preference added."
                />
                <CriteriaGroup
                  title="Allowed locations"
                  items={matchCriteria.allowedLocations}
                  emptyLabel="No location preference added."
                />
              </div>
            </div>
          ) : (
            <EmptyText>
              Add skills, experience, education, work mode, location, and
              weights so candidate scores are meaningful.
            </EmptyText>
          )}
        </Panel>

        <Panel eyebrow="Scoring logic" title="Weights and rules">
          {scoringConfigured && matchCriteria ? (
            <div className="grid gap-3">
              <WeightRow
                label="Skill fit"
                value={matchCriteria.weights.skillMatch}
              />
              <WeightRow
                label="Experience fit"
                value={matchCriteria.weights.experienceFit}
              />
              <WeightRow
                label="Education fit"
                value={matchCriteria.weights.educationFit}
              />
              <WeightRow
                label="Location fit"
                value={matchCriteria.weights.locationFit}
              />
              <WeightRow
                label="Availability fit"
                value={matchCriteria.weights.availabilityFit}
              />
              <Fact
                label="Total weight"
                value={`${getTotalWeight(matchCriteria.weights)}%`}
              />
              <div className="grid gap-2">
                <RuleItem
                  label="Require mandatory skills"
                  enabled={
                    matchCriteria.knockoutRules?.requireAllMandatorySkills
                  }
                />
                <RuleItem
                  label="Reject below experience"
                  enabled={
                    matchCriteria.knockoutRules
                      ?.rejectIfExperienceBelowMinimum
                  }
                />
                <RuleItem
                  label="Reject work mode mismatch"
                  enabled={matchCriteria.knockoutRules?.rejectIfWorkModeMismatch}
                />
                <RuleItem
                  label="Reject location mismatch"
                  enabled={matchCriteria.knockoutRules?.rejectIfLocationMismatch}
                />
              </div>
            </div>
          ) : (
            <EmptyText>No scoring weights or knockout rules configured.</EmptyText>
          )}
        </Panel>
      </section>

      <ApplicationsTable
        applications={job.applications}
        scoringConfigured={scoringConfigured}
      />
    </div>
  );
}

function ApplicationsTable({
  applications,
  scoringConfigured,
}: {
  applications: ApplicationRecord[];
  scoringConfigured: boolean;
}) {
  const columns: DataTableColumn<ApplicationRecord>[] = [
    {
      key: "candidate",
      header: "Candidate",
      sortable: true,
      filterable: true,
      searchable: true,
      sortAccessor: (application) => application.candidate.fullName,
      filterAccessor: (application) => application.candidate.fullName,
      searchAccessor: (application) =>
        `${application.candidate.fullName} ${application.candidate.email}`,
      render: (application) => (
        <div className="min-w-0">
          <Link
            className="font-semibold text-foreground transition hover:text-accent"
            href={`/recruitment/applications/${application.id}`}
          >
            {application.candidate.fullName}
          </Link>
          <p className="mt-1 truncate text-muted">
            {application.candidate.email}
          </p>
        </div>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      sortable: true,
      filterable: true,
      filterType: "select",
      filterOptions: [
        "APPLIED",
        "SCREENING",
        "SHORTLISTED",
        "INTERVIEW",
        "FINAL_REVIEW",
        "OFFER",
        "APPROVED",
        "HIRED",
        "ON_HOLD",
        "REJECTED",
        "WITHDRAWN",
      ].map((stage) => ({ label: stage.replaceAll("_", " "), value: stage })),
      sortAccessor: (application) => application.stage,
      filterAccessor: (application) => application.stage,
      render: (application) => (
        <RecruitmentStageBadge stage={application.stage} />
      ),
    },
    ...(scoringConfigured
      ? [
          {
            key: "matchScore",
            header: "Match score",
            sortable: true,
            filterable: true,
            filterType: "number" as const,
            sortAccessor: (application: ApplicationRecord) =>
              application.matchScore ?? -1,
            filterAccessor: (application: ApplicationRecord) =>
              application.matchScore ?? null,
            render: (application: ApplicationRecord) =>
              typeof application.matchScore === "number" ? (
                <ScorePill score={application.matchScore} />
              ) : (
                <span className="text-muted">Unavailable</span>
              ),
          },
        ]
      : []),
    {
      key: "appliedAt",
      header: "Applied",
      sortable: true,
      filterable: true,
      filterType: "date",
      sortAccessor: (application) => new Date(application.appliedAt).getTime(),
      filterAccessor: (application) => application.appliedAt,
      cellClassName: "text-muted",
      render: (application) => formatDate(application.appliedAt),
    },
  ];

  return (
    <Panel
      eyebrow="Applications"
      title={`Candidates for this opening (${applications.length})`}
    >
      <DataTable
        rows={applications}
        columns={columns}
        getRowKey={(application) => application.id}
        entityLogicalName="job-opening-applications"
        initialSort={{ columnKey: "appliedAt", direction: "desc" }}
        searchPlaceholder="Search candidates"
        pagination={{ page: 1, pageSize: 10, totalItems: applications.length }}
        emptyState={
          <EmptyText>No applications have been submitted for this opening.</EmptyText>
        }
      />
    </Panel>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-white p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function Panel({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <article className="min-w-0 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-muted">{eyebrow}</p>
      <h3 className="mt-1 text-base font-semibold text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-white p-3">
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-1 break-words text-sm text-foreground">{value}</p>
    </div>
  );
}

function CriteriaGroup({
  title,
  items,
  emptyLabel,
  tone = "default",
}: {
  title: string;
  items?: string[];
  emptyLabel: string;
  tone?: "default" | "strong";
}) {
  const badgeClassName =
    tone === "strong"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-border bg-surface-strong text-foreground";

  return (
    <div className="min-w-0 rounded-lg border border-border bg-white p-3">
      <p className="text-xs font-semibold uppercase text-muted">{title}</p>
      {items?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClassName}`}
              key={`${title}-${item}`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

function WeightRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground">
          {value}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-accent-soft">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
        />
      </div>
    </div>
  );
}

function RuleItem({
  enabled,
  label,
}: {
  enabled?: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          enabled
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {enabled ? "On" : "Off"}
      </span>
    </div>
  );
}

function ReadinessBadge({ ready }: { ready: boolean }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
        ready
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {ready ? "Scoring ready" : "Scoring not configured"}
    </span>
  );
}

function ScorePill({ score }: { score: number }) {
  const toneClassName =
    score >= 80
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : score >= 60
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClassName}`}
    >
      {score}%
    </span>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-white/70 p-3 text-sm text-muted">
      {children}
    </p>
  );
}

function getAverageMatchScore(applications: ApplicationRecord[]) {
  const scores = applications
    .map((application) => application.matchScore)
    .filter((score): score is number => typeof score === "number");

  if (!scores.length) return null;

  return Math.round(
    scores.reduce((total, score) => total + score, 0) / scores.length,
  );
}

function getTotalWeight(weights: JobOpeningMatchCriteria["weights"]): number {
  return (
    weights.skillMatch +
    weights.experienceFit +
    weights.educationFit +
    weights.locationFit +
    weights.availabilityFit
  );
}

function listValue(values?: readonly string[] | null) {
  return values?.length ? values.join(", ") : "Not defined";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
