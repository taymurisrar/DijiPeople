import Link from "next/link";
import { StandardModuleRecordPage } from "@/app/components/runtime";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import {
  buildPublishedStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { recruitmentCandidateRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { RecruitmentStageBadge } from "../../_components/recruitment-stage-badge";
import {
  candidateLookupDisplayValues,
  candidateLookupOptions,
  mapCandidateRuntimeRecord,
} from "../../_components/candidate-runtime-record";
import {
  CandidateDocumentRecord,
  CandidateParsingJobRecord,
  CandidateRecord,
  hasMatchCriteriaConfigured,
} from "../../types";

type CandidateDetailPageProps = {
  params: Promise<{
    candidateId: string;
  }>;
  searchParams?: Promise<{
    formId?: string;
  }>;
};

const emptySearchParams: { formId?: string } = {};

export default async function CandidateDetailPage({
  params,
  searchParams,
}: CandidateDetailPageProps) {
  const [{ candidateId }, resolvedSearchParams, sessionUser] =
    await Promise.all([
      params,
      searchParams ?? Promise.resolve(emptySearchParams),
      getSessionUser(),
    ]);

  let candidate: CandidateRecord;

  try {
    candidate = await apiRequestJson<CandidateRecord>(
      `/candidates/${candidateId}`,
    );
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

  const runtime = await buildPublishedStandardRouteRuntime({
    pageKind: "detail",
    recordId: candidate.id,
    sessionUser,
    spec: recruitmentCandidateRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
    "main",
  );

  return (
    <main className="dp-theme-scope grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        lookupDisplayValues={candidateLookupDisplayValues(candidate)}
        lookupOptions={candidateLookupOptions(candidate)}
        mode="read"
        record={mapCandidateRuntimeRecord(candidate)}
        recordId={candidate.id}
        runtime={runtime}
        spec={recruitmentCandidateRuntimeSpec}
        tabContent={{
          applications: <CandidateApplicationsTab candidate={candidate} />,
          documents: <CandidateDocumentsTab documents={candidate.documents} />,
          parsing: <CandidateParsingTab jobs={candidate.parsingJobs} />,
        }}
        title={candidate.fullName || "Candidate"}
      />
    </main>
  );
}

function CandidateApplicationsTab({
  candidate,
}: {
  readonly candidate: CandidateRecord;
}) {
  if (!candidate.applications.length) {
    return <EmptyPanel message="No applications recorded." />;
  }

  return (
    <section className="grid gap-3">
      {candidate.applications.map((application) => {
        const canShowScore = hasMatchCriteriaConfigured(
          application.jobOpening.matchCriteria,
        );

        return (
          <Link
            className="grid gap-3 rounded-lg border border-border bg-surface p-4 transition hover:border-accent/40 hover:bg-accent/5 md:grid-cols-[minmax(0,1fr)_auto_auto]"
            href={`/recruitment/applications/${application.id}`}
            key={application.id}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {application.jobOpening.title}
              </p>
              <p className="text-xs text-muted">
                {application.jobOpening.code || "No code"} · Applied{" "}
                {formatDate(application.appliedAt)}
              </p>
            </div>
            <RecruitmentStageBadge stage={application.stage} />
            <p className="text-sm font-semibold text-foreground">
              {canShowScore && typeof application.matchScore === "number"
                ? `${application.matchScore}% match`
                : "Not scored"}
            </p>
          </Link>
        );
      })}
    </section>
  );
}

function CandidateDocumentsTab({
  documents,
}: {
  readonly documents: readonly CandidateDocumentRecord[];
}) {
  if (!documents.length) {
    return <EmptyPanel message="No documents recorded." />;
  }

  return (
    <section className="grid gap-3">
      {documents.map((document) => (
        <article
          className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-[minmax(0,1fr)_auto]"
          key={document.id}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {document.fileName || document.name}
            </p>
            <p className="text-xs text-muted">
              {document.kind || "Document"} ·{" "}
              {document.parsingStatus || "Not parsed"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {document.isPrimaryResume ? <Tag label="Primary resume" /> : null}
            {document.isLatestResume ? <Tag label="Latest" /> : null}
            {document.viewPath ? (
              <Link
                className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground hover:border-accent/40 hover:text-accent"
                href={document.viewPath}
                target="_blank"
              >
                View
              </Link>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}

function CandidateParsingTab({
  jobs,
}: {
  readonly jobs: readonly CandidateParsingJobRecord[];
}) {
  if (!jobs.length) {
    return <EmptyPanel message="No parsing activity recorded." />;
  }

  return (
    <section className="grid gap-3">
      {jobs.map((job) => (
        <article
          className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-[minmax(0,1fr)_auto]"
          key={job.id}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {job.documentReference.fileName}
            </p>
            <p className="text-xs text-muted">
              {job.parserKey || "Parser"} · Requested {formatDate(job.requestedAt)}
            </p>
            {job.errorMessage ? (
              <p className="mt-2 text-sm text-danger">{job.errorMessage}</p>
            ) : null}
          </div>
          <Tag label={job.status} />
        </article>
      ))}
    </section>
  );
}

function EmptyPanel({ message }: { readonly message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted">
      {message}
    </div>
  );
}

function Tag({ label }: { readonly label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
      {label}
    </span>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Not captured";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
