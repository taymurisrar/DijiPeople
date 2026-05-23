import type { Metadata } from "next";
import { PageShell } from "../_components/site-shell";

export const metadata: Metadata = {
  title: "Features | DijiPeople",
  description:
    "Explore DijiPeople HR operations features across employees, attendance, leave, payroll, recruitment, onboarding, reporting, and tenant control.",
};

const features = [
  ["Employee management", "Profiles, reporting lines, employment data, documents, compensation context, and controlled employee lifecycle updates."],
  ["Attendance", "Daily attendance capture, manual adjustments, check-in workflows, exceptions, and operational visibility."],
  ["Leave", "Leave types, policies, balances, requests, approvals, and team-level visibility."],
  ["Payroll", "Payroll cycles, compensation records, posting rules, payslips, periods, and payroll preparation workflows."],
  ["Documents", "Document categories, references, secure storage, employee documents, candidate documents, and retention-ready organization."],
  ["Recruitment", "Job openings, candidates, applications, stage history, evaluations, CV parsing, and talent pool management."],
  ["Onboarding", "Onboarding templates, tasks, progress tracking, employee conversion, and new-hire readiness."],
  ["Timesheets", "Monthly timesheets, project resources, submissions, reviews, imports, and payroll-ready time inputs."],
  ["Reporting", "Operational dashboards, payroll visibility, attendance summaries, and configurable views."],
  ["Tenant branding", "Tenant logos, colors, login presentation, domains, app titles, and support details."],
  ["Role-based access", "Roles, permissions, teams, elevated access, and tenant-specific control."],
  ["Multi-tenant architecture", "Workspace isolation, tenant billing, feature flags, customer accounts, and admin lifecycle management."],
];

export default function FeaturesPage() {
  return (
    <PageShell>
      <section className="max-w-3xl py-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
          Features
        </p>
        <h1 className="mt-3 font-serif text-4xl text-foreground sm:text-5xl">
          A complete HR operations platform for growing teams.
        </h1>
        <p className="mt-4 text-base leading-7 text-muted">
          DijiPeople brings the core operational modules together with the SaaS
          controls needed to run tenants, access, plans, and billing cleanly.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map(([title, description]) => (
          <article className="rounded-[24px] border border-border bg-white p-5 shadow-sm" key={title}>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </article>
        ))}
      </section>
    </PageShell>
  );
}
