import Link from "next/link";
import { ArrowUpRight, Mail, Phone, Sparkles } from "lucide-react";
import { contactInfo } from "./content";

export function SiteFooter() {
  return (
    <footer className="relative mt-10 overflow-hidden border-t border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(242,247,246,0.95))]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.08),transparent_18%),radial-gradient(circle_at_85%_20%,rgba(226,161,76,0.08),transparent_18%)]" />

      <div className="relative mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-12">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            DijiPeople
          </div>

          <div className="space-y-3">
            <h3 className="max-w-xl text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
              Structured HR operations for teams that need clarity, not chaos.
            </h3>

            <p className="max-w-2xl text-sm leading-7 text-muted sm:text-base">
              DijiPeople helps businesses run cleaner people operations with
              better workflows, stronger control, and a more practical path to
              scale.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="#lead-form"
              className="inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            >
              Request a demo
              <ArrowUpRight className="h-4 w-4" />
            </Link>

            <Link
              href="#plans"
              className="inline-flex items-center rounded-2xl border border-border bg-white/80 px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/20 hover:text-accent"
            >
              Explore plans
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[26px] border border-border bg-white/82 p-5 shadow-sm backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Contact
            </p>

            <div className="mt-4 grid gap-4">
              <FooterContactRow
                icon={<Mail className="h-4 w-4 text-accent" />}
                label="Business"
                value={contactInfo.businessEmail}
              />
              <FooterContactRow
                icon={<Mail className="h-4 w-4 text-accent" />}
                label="Support"
                value={contactInfo.supportEmail}
              />
              <FooterContactRow
                icon={<Phone className="h-4 w-4 text-accent" />}
                label="Phone"
                value={contactInfo.phone}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} DijiPeople. All rights reserved.</p>
            <p>Built for operational businesses.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterContactRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-accent-soft p-2">{icon}</div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {label}
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}