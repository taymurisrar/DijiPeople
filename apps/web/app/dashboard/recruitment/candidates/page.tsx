import Link from "next/link";
import { ModuleViewSelector } from "@/app/components/view-selector/module-view-selector";
import {
  getTableViews,
  resolveVisibleColumns,
  withFallbackViews,
} from "@/lib/customization-views";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../../_lib/business-unit-access";
import { RecruitmentStageBadge } from "../_components/recruitment-stage-badge";
import { CandidateListResponse } from "../types";

type RecruitmentCandidatesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RecruitmentCandidatesPage({
  searchParams,
}: RecruitmentCandidatesPageProps) {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include candidate records."
          title="Candidates are unavailable for your current business unit access."
        />
      </main>
    );
  }

  const params = await searchParams;
  const selectedViewKey = getSearchParam(params.view);
  const [candidates, publishedViews] = await Promise.all([
    apiRequestJson<CandidateListResponse>("/candidates?pageSize=50"),
    getTableViews("candidates"),
  ]);
  const candidateViews = withFallbackViews("candidates", publishedViews, [
    {
      id: "allCandidates",
      viewKey: "allCandidates",
      tableKey: "candidates",
      name: "All Candidates",
      type: "system",
      isDefault: true,
      columnsJson: {
        columns: [
          { columnKey: "firstName" },
          { columnKey: "source" },
          { columnKey: "status" },
          { columnKey: "applications" },
        ],
      },
    },
  ]);
  const selectedView =
    candidateViews.find((view) => view.viewKey === selectedViewKey) ??
    candidateViews.find((view) => view.isDefault) ??
    candidateViews[0] ??
    null;
  const visibleColumnKeys = resolveVisibleColumns("candidates", selectedView, [
    "firstName",
    "source",
    "status",
    "applications",
  ]);

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,248,245,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Candidates
          </p>
          <h3 className="font-serif text-4xl text-foreground">
            Track talent across your hiring funnel.
          </h3>
          <p className="max-w-3xl text-muted">
            Keep candidate records practical today and ready for interviews and
            onboarding later.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href="/dashboard/recruitment/candidates/upload-cv"
          >
            Upload CV
          </Link>
          <Link
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href="/dashboard/recruitment/talent-pool"
          >
            Talent pool
          </Link>
          <Link
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
            href="/dashboard/recruitment/applications"
          >
            View pipeline
          </Link>
          <Link
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/dashboard/recruitment/candidates/new"
          >
            Add candidate
          </Link>
        </div>
      </section>

      <ModuleViewSelector
        configureHref="/dashboard/settings/customization/tables/candidates"
        enabled
        selectedViewId={selectedView?.viewKey ?? ""}
        views={candidateViews}
      />

      {candidates.items.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            No candidates yet
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            Add your first candidate to start building a pipeline.
          </h4>
        </section>
      ) : (
        <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-strong text-left text-muted">
                <tr>
                  {hasCandidateColumn(visibleColumnKeys, "candidate") ? (
                    <th className="px-5 py-4 font-medium">Candidate</th>
                  ) : null}
                  {hasCandidateColumn(visibleColumnKeys, "source") ? (
                    <th className="px-5 py-4 font-medium">Source</th>
                  ) : null}
                  {hasCandidateColumn(visibleColumnKeys, "status") ? (
                    <th className="px-5 py-4 font-medium">Status</th>
                  ) : null}
                  {hasCandidateColumn(visibleColumnKeys, "applications") ? (
                    <th className="px-5 py-4 font-medium">Applications</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white/90">
                {candidates.items.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-accent-soft/30">
                    {hasCandidateColumn(visibleColumnKeys, "candidate") ? (
                      <td className="px-5 py-4">
                        <Link
                          className="font-semibold text-foreground hover:text-accent"
                          href={`/dashboard/recruitment/candidates/${candidate.id}`}
                        >
                          {candidate.fullName}
                        </Link>
                        <p className="mt-1 text-muted">
                          {candidate.email}
                          {candidate.currentDesignation
                            ? ` - ${candidate.currentDesignation}`
                            : ""}
                        </p>
                      </td>
                    ) : null}
                    {hasCandidateColumn(visibleColumnKeys, "source") ? (
                      <td className="px-5 py-4 text-muted">
                        {candidate.source || "Unspecified"}
                        <p>
                          {candidate.currentCity ||
                            candidate.currentCountry ||
                            "Location pending"}
                        </p>
                      </td>
                    ) : null}
                    {hasCandidateColumn(visibleColumnKeys, "status") ? (
                      <td className="px-5 py-4">
                        <RecruitmentStageBadge
                          stage={candidate.currentStatus}
                        />
                      </td>
                    ) : null}
                    {hasCandidateColumn(visibleColumnKeys, "applications") ? (
                      <td className="px-5 py-4 text-muted">
                        {candidate.applications.length} application(s)
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function hasCandidateColumn(
  visibleColumnKeys: string[],
  tableColumnKey: string,
) {
  const map: Record<string, string[]> = {
    candidate: ["firstName", "lastName", "email", "phone"],
    source: ["source", "currentCity", "currentCountry"],
    status: ["status", "currentStatus"],
    applications: ["applications"],
  };

  return (map[tableColumnKey] ?? [tableColumnKey]).some((columnKey) =>
    visibleColumnKeys.includes(columnKey),
  );
}
