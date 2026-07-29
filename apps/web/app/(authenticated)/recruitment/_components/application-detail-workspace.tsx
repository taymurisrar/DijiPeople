import {
  BriefcaseBusiness,
  CalendarDays,
  ExternalLink,
  MapPin,
  Percent,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { ApplicationEvaluationForm } from "./application-evaluation-form";
import { ApplicationStageForm } from "./application-stage-form";
import { JobOpeningStatusBadge } from "./job-opening-status-badge";
import { RecruitmentStageBadge } from "./recruitment-stage-badge";
import { StartOnboardingButton } from "./start-onboarding-button";
import { ApplicationRecord, hasMatchCriteriaConfigured } from "../types";

type ApplicationDetailWorkspaceProps = {
  application: ApplicationRecord;
};

export function ApplicationDetailWorkspace({
  application,
}: ApplicationDetailWorkspaceProps) {
  const scoringConfigured = hasMatchCriteriaConfigured(
    application.jobOpening.matchCriteria,
  );
  const hasValidScore =
    scoringConfigured && typeof application.matchScore === "number";
  const breakdown = application.matchBreakdown;
  const history = [...application.stageHistory].sort(
    (left, right) =>
      new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime(),
  );
  const snapshots = [...(application.historyRecords ?? [])].sort(
    (left, right) => right.snapshotVersion - left.snapshotVersion,
  );
  const evaluations = [...application.evaluations].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-muted">
                Candidate
              </p>
              <h3 className="mt-1 truncate text-lg font-semibold text-foreground">
                {application.candidate.fullName}
              </h3>
              <p className="mt-1 truncate text-sm text-muted">
                {application.candidate.email}
              </p>
            </div>
            <RecruitmentStageBadge stage={application.stage} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              icon={<Percent className="h-4 w-4" />}
              label="Match"
              value={
                !scoringConfigured
                  ? "Off"
                  : hasValidScore
                    ? `${application.matchScore}%`
                    : "N/A"
              }
            />
            <Metric
              icon={<CalendarDays className="h-4 w-4" />}
              label="Applied"
              value={formatDate(application.appliedAt)}
            />
            <Metric
              icon={<MapPin className="h-4 w-4" />}
              label="City"
              value={application.candidate.currentCity || "Not captured"}
            />
            <Metric
              icon={<BriefcaseBusiness className="h-4 w-4" />}
              label="Work mode"
              value={application.candidate.preferredWorkMode || "Not captured"}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0 rounded-lg border border-border bg-white p-3">
              <p className="text-xs font-semibold uppercase text-muted">
                Job opening
              </p>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  href={`/recruitment/jobs/${application.jobOpening.id}`}
                  size="xs"
                  variant="link"
                  rightIcon={<ExternalLink className="h-3.5 w-3.5" />}
                >
                  {application.jobOpening.title}
                </Button>
                <JobOpeningStatusBadge status={application.jobOpening.status} />
              </div>
              {application.jobOpening.code ? (
                <p className="mt-1 text-xs text-muted">
                  {application.jobOpening.code}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Button
                href={`/recruitment/candidates/${application.candidate.id}`}
                size="sm"
                variant="secondary"
                leftIcon={<UserRound className="h-4 w-4" />}
              >
                Candidate
              </Button>
              {application.stage === "HIRED" ? (
                <StartOnboardingButton
                  candidateId={application.candidate.id}
                />
              ) : null}
            </div>
          </div>
        </div>

        <ApplicationStageForm
          applicationId={application.id}
          currentStage={application.stage}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel eyebrow="Match score" title="Decision signals">
          {!scoringConfigured ? (
            <EmptyText>Match scoring is not configured for this job.</EmptyText>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-2 sm:grid-cols-5">
                <Score label="Skill" value={breakdown?.skillMatch?.score} />
                <Score
                  label="Experience"
                  value={breakdown?.experienceFit?.score}
                />
                <Score
                  label="Availability"
                  value={breakdown?.availabilityFit?.score}
                />
                <Score label="Location" value={breakdown?.locationFit?.score} />
                <Score
                  label="Education"
                  value={breakdown?.educationFit?.score}
                />
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <Fact
                  label="Matched skills"
                  value={listValue(breakdown?.skillMatch?.matchedSkills)}
                />
                <Fact
                  label="Missing required"
                  value={listValue(
                    breakdown?.skillMatch?.missingRequiredSkills,
                    "None",
                  )}
                />
                <Fact
                  label="Preferred skills"
                  value={listValue(
                    breakdown?.skillMatch?.matchedPreferredSkills,
                  )}
                />
                <Fact
                  label="Experience"
                  value={
                    breakdown?.experienceFit
                      ? `${breakdown.experienceFit.candidateYearsExperience ?? "N/A"} yrs vs ${breakdown.experienceFit.minimumYearsExperience ?? "N/A"} yrs`
                      : "Not evaluated"
                  }
                />
                <Fact
                  label="Location"
                  value={
                    breakdown?.locationFit
                      ? `${breakdown.locationFit.candidateLocation || "Unknown"}${
                          breakdown.locationFit.matchedLocation
                            ? ` -> ${breakdown.locationFit.matchedLocation}`
                            : ""
                        }`
                      : "Not evaluated"
                  }
                />
                <Fact
                  label="Knockout"
                  value={
                    breakdown?.knockoutSummary
                      ? breakdown.knockoutSummary.passed
                        ? "Passed"
                        : `Failed: ${breakdown.knockoutSummary.failedRules.join(", ")}`
                      : "Not evaluated"
                  }
                />
              </div>
            </div>
          )}
        </Panel>

        <Panel eyebrow="Activity" title="Latest movement">
          <Timeline items={history.slice(0, 6)} />
        </Panel>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Panel eyebrow="Evaluations" title="Interview feedback">
          {evaluations.length ? (
            <div className="grid gap-2">
              {evaluations.slice(0, 4).map((evaluation) => (
                <div
                  className="rounded-lg border border-border bg-white p-3"
                  key={evaluation.id}
                >
                  <p className="text-sm font-semibold text-foreground">
                    Round {evaluation.interviewRound || "-"} -{" "}
                    {evaluation.overallRecommendation || "No recommendation"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {evaluation.interviewDate
                      ? formatDate(evaluation.interviewDate)
                      : "Interview date not captured"}
                  </p>
                  {evaluation.notes ? (
                    <p className="mt-2 line-clamp-2 text-sm text-muted">
                      {evaluation.notes}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyText>No evaluations recorded yet.</EmptyText>
          )}
        </Panel>

        <Panel eyebrow="Audit" title="Record trail">
          <AuditTrail snapshots={snapshots} />
        </Panel>
      </section>

      <details className="group rounded-lg border border-border bg-surface shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase text-muted">
              Evaluation
            </p>
            <h3 className="mt-1 text-base font-semibold text-foreground">
              Add interview feedback
            </h3>
          </div>
          <span className="text-sm font-semibold text-accent group-open:hidden">
            Open
          </span>
          <span className="hidden text-sm font-semibold text-muted group-open:inline">
            Close
          </span>
        </summary>
        <div className="border-t border-border p-4">
          <ApplicationEvaluationForm applicationId={application.id} />
        </div>
      </details>
    </div>
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

function Score({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <p className="truncate text-xs font-semibold uppercase text-muted">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground">
        {typeof value === "number" ? `${value}%` : "N/A"}
      </p>
    </div>
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

function Timeline({
  items,
}: {
  items: ApplicationRecord["stageHistory"];
}) {
  if (!items.length) {
    return <EmptyText>No stage movement recorded yet.</EmptyText>;
  }

  return (
    <div className="grid gap-2">
      {items.map((history) => (
        <div
          className="rounded-lg border border-border bg-white p-3"
          key={history.id}
        >
          <p className="text-sm font-semibold text-foreground">
            {(history.fromStage || "START").replaceAll("_", " ")} -&gt;{" "}
            {history.toStage.replaceAll("_", " ")}
          </p>
          <p className="mt-1 text-xs text-muted">
            {formatDateTime(history.changedAt)}
          </p>
          {history.note ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted">
              {history.note}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function AuditTrail({
  snapshots,
}: {
  snapshots: NonNullable<ApplicationRecord["historyRecords"]>;
}) {
  const latest = snapshots[0];

  if (!latest) {
    return <EmptyText>No application snapshots yet.</EmptyText>;
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-lg border border-border bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Latest: {latest.snapshotReason.replaceAll("_", " ")}
            </p>
            <p className="mt-1 text-xs text-muted">
              Version {latest.snapshotVersion} captured{" "}
              {formatDateTime(latest.snapshotTakenAt)}
            </p>
          </div>
          <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-muted">
            {snapshots.length} version{snapshots.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <details className="rounded-lg border border-border bg-white">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-foreground">
          View audit versions
        </summary>
        <div className="grid gap-2 border-t border-border p-3">
          {snapshots.slice(0, 10).map((record) => (
            <div
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg bg-surface px-3 py-2"
              key={record.id}
            >
              <span className="text-xs font-semibold text-muted">
                v{record.snapshotVersion}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {record.snapshotReason.replaceAll("_", " ")}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {formatDateTime(record.snapshotTakenAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-white/70 p-3 text-sm text-muted">
      {children}
    </p>
  );
}

function listValue(values?: readonly string[] | null, empty = "None captured") {
  return values?.length ? values.join(", ") : empty;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
