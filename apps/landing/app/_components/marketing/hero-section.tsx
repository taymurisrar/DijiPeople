import Link from "next/link";
import { ArrowRight, CheckCircle2, Play, ShieldCheck, Users2, Workflow } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden rounded-[36px] border border-white/65 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(221,243,239,0.92))] px-6 py-10 shadow-[0_24px_80px_rgba(16,33,43,0.08)] sm:px-8 lg:px-12 lg:py-14">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.16),transparent_24%),radial-gradient(circle_at_85%_12%,rgba(221,150,53,0.14),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.18),transparent)]" />
      <div className="absolute -left-16 top-10 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-52 w-52 rounded-full bg-amber-300/10 blur-3xl" />

      <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex rounded-full border border-accent/15 bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            US-based HRM SaaS
          </div>

          <div className="space-y-4">
            <h1 className="max-w-3xl font-serif text-4xl leading-tight text-foreground sm:text-5xl lg:text-6xl lg:leading-[1.08]">
              HR operations that finally feel clear and under control.
            </h1>

            <p className="max-w-2xl text-base leading-7 text-muted sm:text-lg">
              DijiPeople helps growing teams manage employees, approvals,
              attendance, leave, onboarding, and HR workflows in one structured,
              easy-to-run platform.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-3 text-center text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,118,110,0.24)] transition hover:-translate-y-0.5 hover:bg-accent-strong"
              href="#lead-form"
            >
              Request a demo
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>

            <Link
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-white/85 px-6 py-3 text-center text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:border-accent/30 hover:text-accent"
              href="#plans"
            >
              <Play className="h-4 w-4" />
              Explore plans
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <FeaturePill
              icon={<Users2 className="h-4 w-4 text-accent" />}
              text="Employee management"
            />
            <FeaturePill
              icon={<Workflow className="h-4 w-4 text-accent" />}
              text="HR workflows"
            />
            <FeaturePill
              icon={<ShieldCheck className="h-4 w-4 text-accent" />}
              text="Role-based access"
            />
          </div>
        </div>

        <div className="relative">
          <div className="rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur transition hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                Platform snapshot
              </p>
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                Live workflows
              </span>
            </div>

            <div className="mt-5 grid gap-3">
              <SnapshotCard
                title="Employee records"
                status="Active"
                description="Profiles, reporting lines, and documents in one place."
              />
              <SnapshotCard
                title="Leave and approvals"
                status="In review"
                description="Requests move faster with cleaner workflow handling."
              />
              <SnapshotCard
                title="Onboarding flow"
                status="On track"
                description="Standardize how new hires enter the business."
              />
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-surface-strong p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-white p-2 shadow-sm">
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Built for operational clarity
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Less admin noise. Better visibility. Cleaner HR execution.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturePill({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-accent/20">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function SnapshotCard({
  title,
  status,
  description,
}: {
  title: string;
  status: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white/85 p-4 transition hover:border-accent/20 hover:shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          {status}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}