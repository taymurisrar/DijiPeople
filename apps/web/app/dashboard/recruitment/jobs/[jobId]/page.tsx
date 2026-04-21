import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { JobOpeningStatusBadge } from "../../_components/job-opening-status-badge";
import { RecruitmentStageBadge } from "../../_components/recruitment-stage-badge";
import {
  hasMatchCriteriaConfigured,
  JobOpeningMatchCriteria,
  JobOpeningRecord,
} from "../../types";

type JobDetailPageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

type JobOpeningWithMatchCriteria = JobOpeningRecord & {
  matchCriteria?: JobOpeningMatchCriteria | null;
};

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { jobId } = await params;
  const job = await apiRequestJson<JobOpeningWithMatchCriteria>(
    `/job-openings/${jobId}`,
  );

  const matchCriteria = job.matchCriteria ?? null;
  const hasConfiguredScoring = hasMatchCriteriaConfigured(matchCriteria);

  const applicationsWithScores = job.applications.filter(
    (application) => typeof application.matchScore === "number",
  );

  const averageMatchScore =
    applicationsWithScores.length > 0
      ? Math.round(
          applicationsWithScores.reduce(
            (total, application) => total + (application.matchScore ?? 0),
            0,
          ) / applicationsWithScores.length,
        )
      : null;

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-5 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(239,248,245,0.92))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Job Opening
            </p>
            <h1 className="font-serif text-4xl text-foreground">{job.title}</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              {job.description || "No job description added yet."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <JobOpeningStatusBadge status={job.status} />
            <ReadinessBadge ready={hasConfiguredScoring} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href={`/dashboard/recruitment/jobs/${job.id}/edit`}
          >
            Edit opening
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoTile label="Code" value={job.code || "No code"} />
        <InfoTile
          label="Applications"
          value={`${job.applications.length} active record(s)`}
        />
        <InfoTile
          label="Scoring status"
          value={hasConfiguredScoring ? "Configured" : "Not configured"}
        />
        <InfoTile
          label="Average match score"
          value={
            hasConfiguredScoring && averageMatchScore !== null
              ? `${averageMatchScore}%`
              : "Unavailable"
          }
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="grid gap-5 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Match configuration
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              Hiring criteria
            </h2>
            <p className="text-sm leading-6 text-muted">
              This section defines how candidates should be evaluated for this
              opening. If these criteria are not configured, application scores
              should not be treated as meaningful.
            </p>
          </div>

          {hasConfiguredScoring && matchCriteria ? (
            <div className="grid gap-4">
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

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <MetricCard
                  label="Minimum experience"
                  value={
                    matchCriteria.minimumYearsExperience != null
                      ? `${matchCriteria.minimumYearsExperience} year(s)`
                      : "Not defined"
                  }
                />
                <MetricCard
                  label="Education levels"
                  value={
                    matchCriteria.educationLevels?.length
                      ? matchCriteria.educationLevels.join(", ")
                      : "Not defined"
                  }
                />
                <MetricCard
                  label="Notice period"
                  value={
                    matchCriteria.noticePeriodDays != null
                      ? `${matchCriteria.noticePeriodDays} day(s)`
                      : "Not defined"
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
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
            <EmptyStateCard
              title="Scoring is not configured yet"
              description="Add required skills, experience, education, work mode, location, and scoring weightage on the job opening so the system can generate a defensible candidate match score."
            />
          )}
        </article>

        <article className="grid gap-5 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Scoring logic
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              Weights and rules
            </h2>
          </div>

          {hasConfiguredScoring && matchCriteria ? (
            <>
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
              </div>

              <div className="rounded-[20px] border border-border bg-white/90 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">
                  Total weight
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {getTotalWeight(matchCriteria.weights)}%
                </p>
                <p className="mt-1 text-sm text-muted">
                  Best practice is to keep the total at 100% for predictable
                  scoring.
                </p>
              </div>

              <div className="rounded-[20px] border border-border bg-white/90 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">
                  Knockout rules
                </p>

                <div className="mt-3 grid gap-2">
                  <RuleItem
                    label="Require all mandatory skills"
                    enabled={
                      matchCriteria.knockoutRules?.requireAllMandatorySkills
                    }
                  />
                  <RuleItem
                    label="Reject if experience is below minimum"
                    enabled={
                      matchCriteria.knockoutRules
                        ?.rejectIfExperienceBelowMinimum
                    }
                  />
                  <RuleItem
                    label="Reject if work mode mismatches"
                    enabled={
                      matchCriteria.knockoutRules?.rejectIfWorkModeMismatch
                    }
                  />
                  <RuleItem
                    label="Reject if location mismatches"
                    enabled={
                      matchCriteria.knockoutRules?.rejectIfLocationMismatch
                    }
                  />
                </div>
              </div>
            </>
          ) : (
            <EmptyStateCard
              title="No scoring rules available"
              description="This opening currently has no visible scoring weightage or knockout rules configured."
            />
          )}
        </article>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
        <div className="flex flex-col gap-2 border-b border-border px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Applications
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              Candidates for this opening
            </h2>
          </div>
          <p className="text-sm text-muted">
            {hasConfiguredScoring
              ? "Scores are shown only when matching criteria exists."
              : "Scoring is hidden because this opening does not have match criteria configured yet."}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-strong text-left text-muted">
              <tr>
                <th className="px-5 py-4 font-medium">Candidate</th>
                <th className="px-5 py-4 font-medium">Stage</th>
                {hasConfiguredScoring ? (
                  <th className="px-5 py-4 font-medium">Match score</th>
                ) : null}
                <th className="px-5 py-4 font-medium">Applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white/90">
              {job.applications.map((application) => (
                <tr
                  key={application.id}
                  className="transition hover:bg-accent-soft/20"
                >
                  <td className="px-5 py-4">
                    <Link
                      className="font-semibold text-foreground transition hover:text-accent"
                      href={`/dashboard/recruitment/candidates/${application.candidate.id}`}
                    >
                      {application.candidate.fullName}
                    </Link>
                    <p className="mt-1 text-muted">
                      {application.candidate.email}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <RecruitmentStageBadge stage={application.stage} />
                  </td>
                  {hasConfiguredScoring ? (
                    <td className="px-5 py-4">
                      {typeof application.matchScore === "number" ? (
                        <ScorePill score={application.matchScore} />
                      ) : (
                        <span className="text-muted">Unavailable</span>
                      )}
                    </td>
                  ) : null}
                  <td className="px-5 py-4 text-muted">
                    {new Date(application.appliedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}

              {job.applications.length === 0 ? (
                <tr>
                  <td
                    className="px-5 py-6 text-muted"
                    colSpan={hasConfiguredScoring ? 4 : 3}
                  >
                    No applications have been submitted for this opening yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
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

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </article>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-border bg-white/90 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-foreground">
        {value}
      </p>
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
    <div className="rounded-[20px] border border-border bg-white/90 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{title}</p>

      {items?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={`${title}-${item}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${badgeClassName}`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

function WeightRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[20px] border border-border bg-white/90 p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground">
          {value}%
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-accent-soft">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
        />
      </div>
    </div>
  );
}

function RuleItem({
  label,
  enabled,
}: {
  label: string;
  enabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-4 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          enabled
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {enabled ? "Enabled" : "Disabled"}
      </span>
    </div>
  );
}

function EmptyStateCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-border bg-white/70 p-5">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function ReadinessBadge({ ready }: { ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
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
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${toneClassName}`}
    >
      {score}%
    </span>
  );
}
