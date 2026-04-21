import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { CandidateListResponse } from "../recruitment/types";
import { OnboardingStartForm } from "./_components/onboarding-start-form";
import { OnboardingStatusBadge } from "./_components/onboarding-status-badge";
import {
  OnboardingListResponse,
  OnboardingTemplateRecord,
} from "./types";

export default async function OnboardingPage() {
  const [onboardings, candidates, templates] = await Promise.all([
    apiRequestJson<OnboardingListResponse>("/onboarding?pageSize=50"),
    apiRequestJson<CandidateListResponse>("/candidates?pageSize=100"),
    apiRequestJson<OnboardingTemplateRecord[]>("/onboarding/templates"),
  ]);

  return (
    <main className="grid gap-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,248,245,0.9))] p-8 shadow-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">Onboarding</p>
          <h3 className="font-serif text-4xl text-foreground">Turn hired candidates into structured new hires.</h3>
          <p className="max-w-3xl text-muted">
            This first version focuses on checklist-driven onboarding with due dates, task ownership, and completion tracking.
          </p>
        </div>
        <div className="rounded-[24px] border border-border bg-white/80 px-5 py-4 text-sm text-muted">
          {templates.length} template(s) available
        </div>
      </section>

      <section className="grid gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">Start Flow</p>
          <h4 className="mt-2 text-2xl font-semibold text-foreground">Convert a hired candidate</h4>
        </div>
        <OnboardingStartForm candidates={candidates.items} templates={templates} />
      </section>

      <section className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-strong text-left text-muted">
              <tr>
                <th className="px-5 py-4 font-medium">Onboarding</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Progress</th>
                <th className="px-5 py-4 font-medium">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white/90">
              {onboardings.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4">
                    <Link className="font-semibold text-foreground hover:text-accent" href={`/dashboard/onboarding/${item.id}`}>
                      {item.title}
                    </Link>
                    <p className="mt-1 text-muted">
                      {item.employee?.fullName || item.candidate?.fullName || "Unlinked onboarding"}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <OnboardingStatusBadge status={item.status} />
                  </td>
                  <td className="px-5 py-4 text-muted">
                    {item.progress.completedTasks}/{item.progress.totalTasks} tasks
                    <p>{item.progress.percent}% complete</p>
                  </td>
                  <td className="px-5 py-4 text-muted">
                    {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "Not set"}
                  </td>
                </tr>
              ))}
              {onboardings.items.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-muted" colSpan={4}>
                    No onboarding records yet.
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
