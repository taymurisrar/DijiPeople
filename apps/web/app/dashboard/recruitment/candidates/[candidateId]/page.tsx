import Link from "next/link";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { DocumentList } from "@/app/dashboard/_components/documents/document-list";
import { DocumentUploadForm } from "@/app/dashboard/_components/documents/document-upload-form";
import { AccessDeniedState } from "@/app/dashboard/_components/access-denied-state";
import {
  GenericDocumentRecord,
  SharedLookupOption,
} from "@/app/dashboard/_components/documents/types";
import { CandidateDocumentForm } from "../../_components/candidate-document-form";
import {
  CandidateRecord,
  hasMatchCriteriaConfigured,
  JobOpeningMatchCriteria,
} from "../../types";
import { RecruitmentStageBadge } from "../../_components/recruitment-stage-badge";
import { TriggerParseButton } from "../../_components/trigger-parse-button";

type CandidateDetailPageProps = {
  params: Promise<{
    candidateId: string;
  }>;
};

type ResumeLikeDocument = {
  id?: string;
  fileName?: string | null;
  name?: string | null;
  storageKey?: string | null;
  viewPath?: string | null;
  downloadPath?: string | null;
  url?: string | null;
  viewUrl?: string | null;
  downloadUrl?: string | null;
};

type MinimalLinkedDocument = {
  id: string;
  fileName?: string | null;
  name?: string | null;
  kind?: string | null;
  storageKey?: string | null;
  viewPath?: string | null;
  downloadPath?: string | null;
  url?: string | null;
  viewUrl?: string | null;
  downloadUrl?: string | null;
};

type CandidateApplicationWithScoring = CandidateRecord["applications"][number] & {
  jobOpening: CandidateRecord["applications"][number]["jobOpening"] & {
    matchCriteria?: JobOpeningMatchCriteria | null;
  };
};

type CandidateWithJobScoring = Omit<CandidateRecord, "applications"> & {
  applications: CandidateApplicationWithScoring[];
};

export default async function CandidateDetailPage({
  params,
}: CandidateDetailPageProps) {
  const { candidateId } = await params;

  let candidate: CandidateWithJobScoring;
  let documents: GenericDocumentRecord[];
  let documentTypes: SharedLookupOption[];
  let documentCategories: SharedLookupOption[];

  try {
    [candidate, documents, documentTypes, documentCategories] =
      await Promise.all([
        apiRequestJson<CandidateWithJobScoring>(`/candidates/${candidateId}`),
        apiRequestJson<GenericDocumentRecord[]>(
          `/documents/entity/CANDIDATE/${candidateId}`,
        ),
        apiRequestJson<SharedLookupOption[]>("/lookups/document-types"),
        apiRequestJson<SharedLookupOption[]>("/lookups/document-categories"),
      ]);
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 403 || error.status === 404)
    ) {
      return (
        <main className="grid gap-6">
          <AccessDeniedState
            description="This candidate is outside your accessible business-unit scope."
            title="You cannot view this candidate record."
          />
        </main>
      );
    }

    throw error;
  }

  const candidateName = candidate.fullName || "Candidate";
  const location =
    [candidate.currentCity, candidate.currentCountry]
      .filter(Boolean)
      .join(", ") || "Not captured";

  const currentStage = candidate.currentStatus;
  const candidateEmail = candidate.email || "Not captured";
  const candidatePhone = candidate.phone || "Not captured";
  const primaryResumeName =
    candidate.resumeDocument?.fileName ||
    candidate.resumeDocumentReference ||
    "No primary resume linked";

  const applicationsWithConfiguredScoring = candidate.applications.filter(
    (application) => hasMatchCriteriaConfigured(application.jobOpening.matchCriteria),
  );

  const applicationsWithValidScore = applicationsWithConfiguredScoring.filter(
    (application) => typeof application.matchScore === "number",
  );

  const bestMatchScore =
    applicationsWithValidScore.length > 0
      ? Math.max(
          ...applicationsWithValidScore.map(
            (application) => application.matchScore ?? 0,
          ),
        )
      : null;

  const summaryPoints = [
    {
      label: "Current employer",
      value: candidate.currentEmployer || "Not captured",
    },
    {
      label: "Current designation",
      value: candidate.currentDesignation || "Not captured",
    },
    {
      label: "Experience",
      value:
        candidate.totalYearsExperience !== null &&
        candidate.totalYearsExperience !== undefined
          ? `${candidate.totalYearsExperience} years`
          : "Not captured",
    },
    {
      label: "Notice period",
      value: candidate.noticePeriodDays
        ? `${candidate.noticePeriodDays} days`
        : "Not captured",
    },
    {
      label: "Expected salary",
      value: candidate.expectedSalary
        ? `${candidate.expectedSalary}`
        : "Not captured",
    },
    {
      label: "Preferred work mode",
      value: candidate.preferredWorkMode || "Not captured",
    },
    {
      label: "Preferred location",
      value: candidate.preferredLocation || "Not captured",
    },
    {
      label: "Willing to relocate",
      value: candidate.willingToRelocate ? "Yes" : "No / not captured",
    },
  ];

  const resumeDocument = (candidate.resumeDocument ??
    null) as ResumeLikeDocument | null;
  const resumeViewHref = getDocumentViewHref(resumeDocument);
  const resumeDownloadHref = getDocumentDownloadHref(resumeDocument);
  const latestEmployeeDraft = candidate.applications
    .map((application) => application.draftEmployee)
    .filter((draft): draft is NonNullable<typeof candidate.applications[number]["draftEmployee"]> =>
      Boolean(draft),
    )
    .filter((draft) => draft.isDraftProfile)
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )[0];

  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,250,248,0.94))] p-6 shadow-lg lg:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                  Candidate profile
                </p>
                <RecruitmentStageBadge stage={currentStage} />
              </div>

              <h1 className="font-serif text-3xl text-foreground lg:text-4xl">
                {candidateName}
              </h1>

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                <span>{candidateEmail}</span>
                <span>{candidatePhone}</span>
                <span>{location}</span>
                <span>{candidate.source || "Source not captured"}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TopMetric
                label="Applications"
                value={`${candidate.applications.length}`}
                hint="Linked records"
              />
              <TopMetric
                label="Resume"
                value={
                  candidate.resumeDocument?.fileName
                    ? "Available"
                    : "Missing"
                }
                hint={primaryResumeName}
              />
              <TopMetric
                label="Skills"
                value={`${candidate.skills.length}`}
                hint="Captured tags"
              />
              <TopMetric
                label="Parsing jobs"
                value={`${candidate.parsingJobs.length}`}
                hint="Resume extraction activity"
              />
              <TopMetric
                label="Best match"
                value={bestMatchScore !== null ? `${bestMatchScore}%` : "N/A"}
                hint={
                  applicationsWithConfiguredScoring.length > 0
                    ? "Across configured openings"
                    : "No scored openings"
                }
              />
              <TopMetric
                label="Scored applications"
                value={`${applicationsWithConfiguredScoring.length}`}
                hint="Openings with criteria"
              />
            </div>
          </div>

          <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:w-[360px] xl:grid-cols-1">
            {["APPROVED", "HIRED"].includes(candidate.currentStatus) ? (
              <Link
                className="inline-flex items-center justify-center rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
                href="/dashboard/onboarding"
              >
                Start onboarding
              </Link>
            ) : null}

            {latestEmployeeDraft ? (
              <Link
                className="inline-flex items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100"
                href={`/dashboard/recruitment/employee-drafts/${latestEmployeeDraft.id}`}
              >
                Visit Employee Draft
              </Link>
            ) : null}

            <Link
              className="inline-flex items-center justify-center rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent/30 hover:text-accent"
              href={`/dashboard/recruitment/candidates/${candidate.id}/edit`}
            >
              Edit candidate
            </Link>

            <Link
              className="inline-flex items-center justify-center rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent/30 hover:text-accent"
              href="/dashboard/recruitment/candidates"
            >
              Back to candidates
            </Link>

            {resumeViewHref ? (
              <a
                className="inline-flex items-center justify-center rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent/30 hover:text-accent"
                href={resumeViewHref}
                rel="noreferrer"
                target="_blank"
              >
                View resume
              </a>
            ) : null}

            {resumeDownloadHref ? (
              <a
                className="inline-flex items-center justify-center rounded-2xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent/30 hover:text-accent"
                href={resumeDownloadHref}
                rel="noreferrer"
                target="_blank"
              >
                Download resume
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6">
        <div className="grid gap-6">
          <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Recruiter snapshot
                </p>
                <h2 className="text-2xl font-semibold text-foreground">
                  Decision-ready summary
                </h2>
                <p className="max-w-3xl text-sm text-muted">
                  This section gives HR and recruiters the essentials first:
                  current profile, experience, preferences, and hiring context.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {summaryPoints.map((item) => (
                <SummaryTile
                  key={item.label}
                  label={item.label}
                  value={item.value}
                />
              ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="space-y-3 rounded-[22px] border border-border bg-white p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Profile summary
                  </p>
                  <p className="mt-3 text-sm leading-7 text-foreground">
                    {candidate.profileSummary ||
                      "No recruiter-ready profile summary has been added yet."}
                  </p>
                </div>
              </div>

              <div className="space-y-3 rounded-[22px] border border-border bg-white p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Skills
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {candidate.skills.length > 0 ? (
                      candidate.skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground"
                        >
                          {skill}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-muted">
                        No skills captured yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Candidate details
                </p>
                <h2 className="text-2xl font-semibold text-foreground">
                  Full profile information
                </h2>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <DetailItem label="Full name" value={candidateName} />
              <DetailItem label="Email" value={candidateEmail} />
              <DetailItem label="Phone" value={candidatePhone} />
              <DetailItem label="Source" value={candidate.source || "Unspecified"} />
              <DetailItem label="Location" value={location} />
              <DetailItem
                label="Resume reference"
                value={primaryResumeName}
              />
            </div>
          </article>

          <article className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Candidate audit history
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                Snapshot timeline
              </h2>
              <p className="mt-2 text-sm text-muted">
                Operational screens show only the latest record. These entries track superseded candidate snapshots.
              </p>
            </div>

            {candidate.historyRecords && candidate.historyRecords.length > 0 ? (
              <div className="grid gap-3 p-5">
                {candidate.historyRecords.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-[20px] border border-border bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        v{entry.snapshotVersion} • {entry.snapshotReason.replaceAll("_", " ")}
                      </p>
                      <p className="text-xs text-muted">
                        {new Date(entry.snapshotTakenAt).toLocaleString()}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Original created date: {new Date(entry.originalCreatedAt).toLocaleDateString()}
                    </p>
                    {entry.sourceChannel ? (
                      <p className="mt-1 text-xs text-muted">Source channel: {entry.sourceChannel}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-sm text-muted">
                No candidate history snapshots yet.
              </div>
            )}
          </article>

          <article className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Applications
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                Role history and hiring progress
              </h2>
              <p className="mt-2 text-sm text-muted">
                See where the candidate stands across openings. Match score is
                shown only when the linked job opening has scoring criteria configured.
              </p>
            </div>

            {candidate.applications.length === 0 ? (
              <div className="px-5 py-8 text-sm text-muted">
                This candidate has not been linked to a job opening yet.
              </div>
            ) : (
              <div className="grid gap-4 p-5">
                {candidate.applications.map((application) => {
                  const scoringConfigured = hasMatchCriteriaConfigured(
                    application.jobOpening.matchCriteria,
                  );

                  return (
                    <div
                      key={application.id}
                      className="grid gap-4 rounded-[22px] border border-border bg-white p-4 lg:grid-cols-[minmax(0,1.4fr)_auto_auto]"
                    >
                      <div className="min-w-0">
                        <Link
                          className="block truncate text-base font-semibold text-foreground transition hover:text-accent"
                          href={`/dashboard/recruitment/applications/${application.id}`}
                        >
                          {application.jobOpening.title}
                        </Link>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                          <span>{application.jobOpening.code || "No code"}</span>
                          <span>•</span>
                          {scoringConfigured ? (
                            typeof application.matchScore === "number" ? (
                              <span className="font-medium text-foreground">
                                Match {application.matchScore}%
                              </span>
                            ) : (
                              <span>Score unavailable</span>
                            )
                          ) : (
                            <span>Scoring not configured</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center">
                        <RecruitmentStageBadge stage={application.stage} />
                      </div>

                      <div className="text-sm text-muted lg:text-right">
                        Applied{" "}
                        {new Date(application.appliedAt).toLocaleDateString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </article>

          <article className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Candidate files
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                Resumes and supporting documents
              </h2>
              <p className="mt-2 text-sm text-muted">
                Everything uploaded against the candidate in one place.
              </p>
            </div>

            {candidate.documents.length === 0 ? (
              <div className="px-5 py-8 text-sm text-muted">
                No candidate documents registered yet.
              </div>
            ) : (
              <div className="grid gap-4 p-5">
                {candidate.documents.map((document) => (
                  <div
                    key={document.id}
                    className="grid gap-3 rounded-[22px] border border-border bg-white p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(160px,0.7fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {document.fileName}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {document.name || "Untitled document"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {document.isPrimaryResume ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            Primary resume
                          </span>
                        ) : null}
                        {document.isLatestResume ? (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                            Latest resume
                          </span>
                        ) : null}
                        {document.parsingStatus ? (
                          <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted">
                            Parse: {document.parsingStatus}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-sm text-muted">
                      <p>{document.kind}</p>
                      <p className="mt-1 truncate">
                        {document.storageKey || "Metadata only"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {getLinkedDocumentHref(document) ? (
                        <a
                          className="inline-flex items-center justify-center rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                          href={getLinkedDocumentHref(document) ?? "#"}
                          rel="noreferrer"
                          target="_blank"
                        >
                          View
                        </a>
                      ) : (
                        <span className="inline-flex items-center justify-center rounded-2xl border border-border/70 px-4 py-2 text-sm font-medium text-muted">
                          No file link
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Resume metadata
                </p>
                <h2 className="text-2xl font-semibold text-foreground">
                  Register or update primary resume details
                </h2>
              </div>

              <div className="mt-5">
                <CandidateDocumentForm candidateId={candidate.id} />
              </div>
            </article>

            <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Parsing
                </p>
                <h2 className="text-2xl font-semibold text-foreground">
                  Resume extraction
                </h2>
                <p className="text-sm text-muted">
                  Trigger parsing after a primary resume is linked. Results and
                  errors appear below.
                </p>
              </div>

              <div className="mt-5">
                {candidate.resumeDocument ? (
                  <TriggerParseButton
                    candidateId={candidate.id}
                    documentId={candidate.resumeDocument.id}
                  />
                ) : (
                  <div className="rounded-[20px] border border-dashed border-border bg-white px-4 py-5 text-sm text-muted">
                    Register a primary resume first before triggering parsing.
                  </div>
                )}
              </div>
            </article>
          </section>

          <article className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Parsed data
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                Extraction results
              </h2>
            </div>

            <div className="grid gap-4 p-5">
              {candidate.parsingJobs.length === 0 ? (
                <p className="text-sm text-muted">
                  No parsing jobs yet. Once parsing runs, extracted resume
                  information will appear here.
                </p>
              ) : (
                candidate.parsingJobs.map((job) => (
                  <div
                    key={job.id}
                    className="grid gap-3 rounded-[22px] border border-border bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-foreground">
                        {job.documentReference.fileName}
                      </p>
                      <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                        {job.status}
                      </span>
                    </div>

                    <p className="text-sm text-muted">
                      Parser key: {job.parserKey || "provider-pending"}
                    </p>

                    {job.resultMetadata ? (
                      <pre className="overflow-x-auto rounded-2xl bg-slate-950 px-4 py-3 text-xs text-slate-100">
                        {JSON.stringify(job.resultMetadata, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted">
                        Parsed data is not available yet.
                      </p>
                    )}

                    {job.errorMessage ? (
                      <p className="text-sm text-danger">{job.errorMessage}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

function getDocumentViewHref(document: ResumeLikeDocument | null): string | null {
  if (!document) {
    return null;
  }

  if (document.viewPath) {
    return document.viewPath;
  }

  if (document.viewUrl) {
    return document.viewUrl;
  }

  if (document.url) {
    return document.url;
  }

  if (document.downloadUrl) {
    return document.downloadUrl;
  }

  if (document.downloadPath) {
    return document.downloadPath;
  }

  if (document.storageKey && isAbsoluteUrl(document.storageKey)) {
    return document.storageKey;
  }

  return null;
}

function getDocumentDownloadHref(
  document: ResumeLikeDocument | null,
): string | null {
  if (!document) {
    return null;
  }

  if (document.downloadPath) {
    return document.downloadPath;
  }

  if (document.downloadUrl) {
    return document.downloadUrl;
  }

  if (document.url) {
    return document.url;
  }

  if (document.viewUrl) {
    return document.viewUrl;
  }

  if (document.viewPath) {
    return document.viewPath;
  }

  if (document.storageKey && isAbsoluteUrl(document.storageKey)) {
    return document.storageKey;
  }

  return null;
}

function getLinkedDocumentHref(document: MinimalLinkedDocument): string | null {
  if (document.viewPath) {
    return document.viewPath;
  }

  if (document.viewUrl) {
    return document.viewUrl;
  }

  if (document.url) {
    return document.url;
  }

  if (document.downloadUrl) {
    return document.downloadUrl;
  }

  if (document.downloadPath) {
    return document.downloadPath;
  }

  if (document.storageKey && isAbsoluteUrl(document.storageKey)) {
    return document.storageKey;
  }

  return null;
}

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function TopMetric({
  hint,
  label,
  value,
}: {
  hint: string;
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-[22px] border border-border bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 truncate text-sm text-muted">{hint}</p>
    </article>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[20px] border border-border bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium leading-6 text-foreground">
        {value}
      </p>
    </article>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[20px] border border-border bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-medium text-foreground">
        {value}
      </p>
    </article>
  );
}
