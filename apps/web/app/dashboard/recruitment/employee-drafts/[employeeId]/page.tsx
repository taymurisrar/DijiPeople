import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "@/app/dashboard/_components/access-denied-state";
import {
  EmployeeListResponse,
  EmployeeProfile,
} from "@/app/dashboard/employees/types";
import { EmployeeDraftForm } from "../../_components/employee-draft-form";

type EmployeeDraftPageProps = {
  params: Promise<{
    employeeId: string;
  }>;
};

export default async function EmployeeDraftPage({
  params,
}: EmployeeDraftPageProps) {
  const { employeeId } = await params;

  let employee: EmployeeProfile;
  let managers: EmployeeListResponse;

  try {
    [employee, managers] = await Promise.all([
      apiRequestJson<EmployeeProfile>(`/employees/${employeeId}`),
      apiRequestJson<EmployeeListResponse>("/employees?pageSize=100"),
    ]);
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 403 || error.status === 404)
    ) {
      return (
        <main className="grid gap-6">
          <AccessDeniedState
            description="This employee draft is outside your accessible business-unit scope."
            title="You cannot view this employee draft."
          />
        </main>
      );
    }

    throw error;
  }

  if (!employee) {
    notFound();
  }

  if (!employee.isDraftProfile) {
    redirect(`/dashboard/employees/${employee.id}`);
  }

  return (
    <main className="grid gap-6">
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Recruitment to Employee Draft
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          {employee.fullName} - Draft Employee
        </h1>
        <p className="mt-2 max-w-3xl text-muted">
          This draft was generated automatically when the application moved to
          Hired. Complete these essentials before final onboarding conversion.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          {employee.sourceApplicationId ? (
            <span className="rounded-full border border-border bg-white px-3 py-1">
              Application: {employee.sourceApplicationId.slice(0, 8)}
            </span>
          ) : null}
          {employee.sourceCandidateId ? (
            <span className="rounded-full border border-border bg-white px-3 py-1">
              Candidate: {employee.sourceCandidateId.slice(0, 8)}
            </span>
          ) : null}
          {employee.sourceJobOpeningId ? (
            <span className="rounded-full border border-border bg-white px-3 py-1">
              Job: {employee.sourceJobOpeningId.slice(0, 8)}
            </span>
          ) : null}
        </div>
      </section>

      <EmployeeDraftForm employee={employee} managerOptions={managers.items} />

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
            href={`/dashboard/employees/${employee.id}`}
          >
            Open full employee profile
          </Link>
          {employee.sourceCandidateId ? (
            <Link
              className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
              href={`/dashboard/recruitment/candidates/${employee.sourceCandidateId}`}
            >
              Back to candidate
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
