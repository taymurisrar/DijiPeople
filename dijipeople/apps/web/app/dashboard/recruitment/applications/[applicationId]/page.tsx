import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { ApplicationEvaluationForm } from "../../_components/application-evaluation-form";
import { ApplicationStageForm } from "../../_components/application-stage-form";
import { RecruitmentStageBadge } from "../../_components/recruitment-stage-badge";
import { ApplicationRecord, hasMatchCriteriaConfigured } from "../../types";

type ApplicationDetailPageProps = {
  params: Promise<{
    applicationId: string;
  }>;
};

export default async function ApplicationDetailPage({
  params,
}: ApplicationDetailPageProps) {
  const { applicationId } = await params;
  const application = await apiRequestJson<ApplicationRecord>(
    `/applications/${applicationId}`,
  );

  const scoringConfigured = hasMatchCriteriaConfigured(
    application.jobOpening.matchCriteria,
  );
  const hasValidScore =
    scoringConfigured && typeof application.matchScore === "number";

  const breakdownEntries = [
    ["Skill fit", application.matchBreakdown?.skillMatch?.score ?? null],
    ["Experience fit", application.matchBreakdown?.experienceFit?.score ?? null],
    ["Availability fit", application.matchBreakdown?.availabilityFit?.score ?? null],
    ["Location fit", application.matchBreakdown?.locationFit?.score ?? null],
    ["Education fit", application.matchBreakdown?.educationFit?.score ?? null],
  ].filter((entry): entry is [string, number] => entry[1] !== null);

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,248,245,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">Application</p>
          <h3 className="font-serif text-4xl text-foreground">
            {application.candidate.fullName}
          </h3>
          <p className="max-w-3xl text-muted">
            {application.jobOpening.title}
            {application.jobOpening.code ? ` • ${application.jobOpening.code}` : ""}
          </p>
        </div>
        <RecruitmentStageBadge stage={application.stage} />
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <InfoTile
          label="Match score"
          value={
            !scoringConfigured
              ? "Not configured"
              : hasValidScore
                ? `${application.matchScore}%`
                : "Unavailable"
          }
        />
        <InfoTile label="Applied" value={new Date(application.appliedAt).toLocaleDateString()} />
        <InfoTile label="Current city" value={application.candidate.currentCity || "Not captured"} />
        <InfoTile label="Work mode" value={application.candidate.preferredWorkMode || "Not captured"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">Match Breakdown</p>
            <h4 className="mt-2 text-2xl font-semibold text-foreground">
              Explainable score
            </h4>
          </div>
          {!scoringConfigured ? (
            <div className="rounded-[20px] border border-dashed border-border bg-white/90 p-4 text-sm text-muted">
              Match scoring is not configured for this job opening.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {breakdownEntries.length > 0 ? (
                  breakdownEntries.map(([label, value]) => (
                    <div key={label} className="rounded-[20px] border border-border bg-white/90 p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{value}%</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[20px] border border-dashed border-border bg-white/90 p-4 text-sm text-muted md:col-span-2">
                    Score is unavailable for this application.
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <DetailCard
                  label="Matched skills"
                  value={application.matchBreakdown?.skillMatch?.matchedSkills?.join(", ") || "None"}
                />
                <DetailCard
                  label="Missing required skills"
                  value={application.matchBreakdown?.skillMatch?.missingRequiredSkills?.join(", ") || "None"}
                />
                <DetailCard
                  label="Matched preferred skills"
                  value={application.matchBreakdown?.skillMatch?.matchedPreferredSkills?.join(", ") || "None"}
                />
                <DetailCard
                  label="Experience fit"
                  value={
                    application.matchBreakdown?.experienceFit
                      ? `${application.matchBreakdown.experienceFit.candidateYearsExperience ?? "N/A"} yrs vs minimum ${application.matchBreakdown.experienceFit.minimumYearsExperience ?? "N/A"} yrs`
                      : "Not evaluated"
                  }
                />
                <DetailCard
                  label="Education fit"
                  value={
                    application.matchBreakdown?.educationFit?.matchedEducationLevels?.join(", ") ||
                    "Not evaluated"
                  }
                />
                <DetailCard
                  label="Location fit"
                  value={
                    application.matchBreakdown?.locationFit
                      ? `${application.matchBreakdown.locationFit.candidateLocation || "Unknown"}${application.matchBreakdown.locationFit.matchedLocation ? ` -> ${application.matchBreakdown.locationFit.matchedLocation}` : ""}`
                      : "Not evaluated"
                  }
                />
                <DetailCard
                  label="Availability fit"
                  value={
                    application.matchBreakdown?.availabilityFit
                      ? `${application.matchBreakdown.availabilityFit.candidateNoticePeriodDays ?? "N/A"} days vs max ${application.matchBreakdown.availabilityFit.allowedNoticePeriodDays ?? "N/A"} days`
                      : "Not evaluated"
                  }
                />
                <DetailCard
                  label="Knockout summary"
                  value={
                    application.matchBreakdown?.knockoutSummary
                      ? application.matchBreakdown.knockoutSummary.passed
                        ? "Passed"
                        : `Failed: ${application.matchBreakdown.knockoutSummary.failedRules.join(", ")}`
                      : "Not evaluated"
                  }
                />
              </div>
            </>
          )}

          {application.rejectionReason ? (
            <div className="rounded-[20px] border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-rose-700">Rejection reason</p>
              <p className="mt-2 text-sm text-rose-900">{application.rejectionReason}</p>
            </div>
          ) : null}
        </article>

        <div className="grid gap-4">
          <ApplicationStageForm
            applicationId={application.id}
            currentStage={application.stage}
          />
          <div className="grid gap-3 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">Linked records</p>
            <Link
              className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
              href={`/dashboard/recruitment/candidates/${application.candidate.id}`}
            >
              Open candidate profile
            </Link>
            <Link
              className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
              href={`/dashboard/recruitment/jobs/${application.jobOpening.id}`}
            >
              Open job opening
            </Link>
            {application.draftEmployee?.isDraftProfile ? (
              <Link
                className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100"
                href={`/dashboard/recruitment/employee-drafts/${application.draftEmployee.id}`}
              >
                Visit employee draft
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="grid content-start gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">Stage history</p>
            <h4 className="mt-2 text-2xl font-semibold text-foreground">Progression log</h4>
          </div>
          <div className="grid gap-3">
            {application.stageHistory.map((history) => (
              <div key={history.id} className="rounded-[20px] border border-border bg-white/90 p-4">
                <p className="font-medium text-foreground">
                  {(history.fromStage || "START").replaceAll("_", " ")} →{" "}
                  {history.toStage.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {new Date(history.changedAt).toLocaleString()}
                </p>
                {history.note ? (
                  <p className="mt-2 text-sm text-muted">{history.note}</p>
                ) : null}
              </div>
            ))}
          </div>
        </article>

        <article className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">Application audit history</p>
            <h4 className="mt-2 text-2xl font-semibold text-foreground">Snapshot timeline</h4>
          </div>
          {application.historyRecords && application.historyRecords.length > 0 ? (
            <div className="grid gap-3">
              {application.historyRecords.map((record) => (
                <div key={record.id} className="rounded-[20px] border border-border bg-white/90 p-4">
                  <p className="font-medium text-foreground">
                    v{record.snapshotVersion} • {record.snapshotReason.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Snapshot: {new Date(record.snapshotTakenAt).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Original applied: {new Date(record.originalAppliedAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No application snapshots yet.</p>
          )}
        </article>
</section>
<section className="grid gap-4">

        <article className="grid gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">Evaluation</p>
            <h4 className="mt-2 text-2xl font-semibold text-foreground">Add interview feedback</h4>
          </div>
          <ApplicationEvaluationForm applicationId={application.id} />
          <div className="grid gap-3 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">Saved evaluations</p>
            {application.evaluations.length === 0 ? (
              <p className="text-sm text-muted">No evaluations recorded yet.</p>
            ) : (
              application.evaluations.map((evaluation) => (
                <div key={evaluation.id} className="rounded-[20px] border border-border bg-white/90 p-4">
                  <p className="font-medium text-foreground">
                    Round {evaluation.interviewRound || "-"} •{" "}
                    {evaluation.overallRecommendation || "No recommendation yet"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {evaluation.interviewDate
                      ? new Date(evaluation.interviewDate).toLocaleDateString()
                      : "Interview date not captured"}
                  </p>
                  {evaluation.notes ? (
                    <p className="mt-2 text-sm text-muted">{evaluation.notes}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </article>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-border bg-white/90 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
