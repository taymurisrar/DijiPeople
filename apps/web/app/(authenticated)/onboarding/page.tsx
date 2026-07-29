import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildPublishedStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { onboardingRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";
import type { EmployeeOnboardingRecord, OnboardingListResponse } from "./types";

type OnboardingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const [businessUnitAccess, params, sessionUser] = await Promise.all([
    getBusinessUnitAccessSummary(),
    searchParams,
    getSessionUser(),
  ]);

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include onboarding records."
          title="Onboarding is unavailable for your current business unit access."
        />
      </main>
    );
  }

  const page = parsePositiveInteger(getSearchParam(params.page), 1);
  const pageSize = parsePositiveInteger(getSearchParam(params.pageSize), 25);
  const onboardingQuery = buildOnboardingQuery(params, page, pageSize);
  const [onboardings, runtime] = await Promise.all([
    apiRequestJson<OnboardingListResponse>(`/onboarding?${onboardingQuery}`),
    buildPublishedStandardRouteRuntime({
      pageKind: "list",
      sessionUser,
      spec: onboardingRuntimeSpec,
    }),
  ]);

  return (
    <main className="grid gap-6">
      <StandardModuleListPage
        commandRecord={{
          onboardingCount: onboardings.meta.total,
        }}
        pagination={{
          page: onboardings.meta.page,
          pageSize: onboardings.meta.pageSize,
          totalItems: onboardings.meta.total,
          pathname: "/onboarding",
          searchParams: toPaginationSearchParams(params),
        }}
        records={onboardings.items.map(mapOnboardingRecord)}
        runtime={runtime}
        spec={onboardingRuntimeSpec}
        title="Onboarding"
      />
    </main>
  );
}

function mapOnboardingRecord(onboarding: EmployeeOnboardingRecord) {
  const draftEmployee = onboarding.employee?.isDraftProfile
    ? onboarding.employee
    : onboarding.candidate?.draftEmployee;
  const personName =
    onboarding.employee?.fullName ?? onboarding.candidate?.fullName ?? "";

  return {
    ...onboarding,
    personName,
    candidateEmail: onboarding.candidate?.email ?? "",
    templateName: onboarding.template?.name ?? "",
    progressPercent: onboarding.progress.percent,
    progressText: `${onboarding.progress.percent}% (${onboarding.progress.completedTasks}/${onboarding.progress.totalTasks} tasks)`,
    blockerCount: onboarding.readiness.blockers.length,
    draftProfileStatus: onboarding.employee
      ? onboarding.employee.isDraftProfile
        ? "Draft profile"
        : "Employee created"
      : draftEmployee
        ? "Draft profile"
        : "Not created",
  };
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parsePositiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function buildOnboardingQuery(
  params: Record<string, string | string[] | undefined>,
  page: number,
  pageSize: number,
) {
  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("pageSize", String(pageSize));

  ["search", "status"].forEach((key) => {
    const value = getSearchParam(params[key]);
    if (value) {
      query.set(key, value);
    }
  });

  return query.toString();
}

function toPaginationSearchParams(
  params: Record<string, string | string[] | undefined>,
) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      getSearchParam(value) || undefined,
    ]),
  );
}
