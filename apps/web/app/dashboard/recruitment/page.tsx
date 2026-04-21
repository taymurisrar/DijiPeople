import Link from "next/link";

const recruitmentLinks = [
  {
    href: "/dashboard/recruitment/candidates/upload-cv",
    title: "Upload CV",
    description:
      "Upload a resume, review parsed details, correct fields, and save the candidate in one flow.",
    cta: "Open CV Upload",
  },
  {
    href: "/dashboard/recruitment/candidates",
    title: "Candidates",
    description:
      "Manage candidate profiles, documents, and parser review outcomes.",
    cta: "Open Candidates",
  },
  {
    href: "/dashboard/recruitment/applications",
    title: "Applications",
    description:
      "Track stage movement, evaluations, and match score details by opening.",
    cta: "Open Pipeline",
  },
  {
    href: "/dashboard/recruitment/jobs",
    title: "Job Openings",
    description: "Create and manage openings that drive the hiring pipeline.",
    cta: "Open Jobs",
  },
  {
    href: "/dashboard/recruitment/talent-pool",
    title: "Talent Pool",
    description:
      "Search previously rejected candidates and reuse them for new opportunities.",
    cta: "Open Talent Pool",
  },
];

export default function RecruitmentIndexPage() {
  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,248,245,0.9))] p-8 shadow-lg">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">Recruitment</p>
        <h3 className="mt-3 font-serif text-4xl text-foreground">
          Manage hiring from CV upload to onboarding.
        </h3>
        <p className="mt-3 max-w-3xl text-muted">
          Start from CV intake, then move through matching, evaluation, and final conversion.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {recruitmentLinks.map((item) => (
          <article
            key={item.href}
            className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm"
          >
            <div>
              <h4 className="text-xl font-semibold text-foreground">{item.title}</h4>
              <p className="mt-2 text-sm text-muted">{item.description}</p>
            </div>
            <Link
              className="justify-self-start rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
              href={item.href}
            >
              {item.cta}
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
