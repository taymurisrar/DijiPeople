import {
  Building2,
  CreditCard,
  FileText,
  Mail,
  Palette,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Users,
  Workflow,
} from "lucide-react";
import { PageHeader } from "@/app/_components/ui/page-header";
import { SettingsCard } from "@/app/_components/settings/settings-card";
import { SettingsSection } from "@/app/_components/settings/settings-section";
import type { SettingsCardProps } from "@/app/_components/settings/settings-card";

type SettingsMenuGroup = {
  title: string;
  description: string;
  items: SettingsCardProps[];
};

const settingsGroups: SettingsMenuGroup[] = [
  {
    title: "Platform",
    description: "System defaults, features, security, and access control.",
    items: [
      {
        title: "Platform defaults",
        description: "Country, currency, timezone, locale, and global behavior.",
        href: "/settings/platform-defaults",
        icon: Settings,
        badge: "Core",
      },
      {
        title: "Feature catalog",
        description: "Modules and capabilities available across the platform.",
        href: "/settings/features",
        icon: Sparkles,
        badge: "Core",
      },
      {
        title: "Security & access",
        description: "Roles, permissions, admin policies, and access rules.",
        href: "/settings/security",
        icon: ShieldCheck,
        badge: "Recommended",
      },
    ],
  },
  {
    title: "Lifecycle",
    description: "Lead, customer, onboarding, and tenant rules.",
    items: [
      {
        title: "Lead definitions",
        description: "Statuses, sources, qualification, and pipeline rules.",
        href: "/settings/lead-definitions",
        icon: Workflow,
      },
      {
        title: "Customer definitions",
        description: "Lifecycle stages, readiness, and account rules.",
        href: "/settings/customer-definitions",
        icon: Users,
      },
      {
        title: "Onboarding definitions",
        description: "Checklist rules, statuses, and tenant readiness.",
        href: "/settings/onboarding-definitions",
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    title: "Commercial",
    description: "Plans, billing, invoices, and payments.",
    items: [
      {
        title: "Plans & visibility",
        description: "Plan visibility, commercial options, and defaults.",
        href: "/settings/plans",
        icon: Tags,
        badge: "Core",
      },
      {
        title: "Billing defaults",
        description: "Billing cycles, taxes, currencies, and payment terms.",
        href: "/settings/billing",
        icon: CreditCard,
      },
      {
        title: "Invoice defaults",
        description: "Numbering, prefixes, due dates, and invoice notes.",
        href: "/settings/invoices",
        icon: FileText,
      },
    ],
  },
  {
    title: "Branding & communication",
    description: "Brand identity, email delivery, and company profile.",
    items: [
      {
        title: "Branding",
        description: "Logo, colors, favicon, and visual identity.",
        href: "/settings/branding",
        icon: Palette,
        badge: "Recommended",
      },
      {
        title: "Email provider",
        description: "SMTP, sender identity, templates, and delivery rules.",
        href: "/settings/email",
        icon: Mail,
      },
      {
        title: "Company profile",
        description: "Business name, address, and public company details.",
        href: "/settings/company-profile",
        icon: Building2,
      },
    ],
  },
];

const recommendedSettings = settingsGroups
  .flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupTitle: group.title,
    })),
  )
  .filter((item) => item.badge === "Core" || item.badge === "Recommended");

export default async function SettingsPage() {
  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Platform settings"
        description="Configure global defaults, lifecycle rules, commercial behavior, branding, communication, and security from one clean admin area."
      />

      <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                disabled
                placeholder="Search settings..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-3 text-sm text-slate-500 outline-none"
              />
            </div>

            <nav className="mt-5 space-y-1">
              {settingsGroups.map((group) => (
                <a
                  key={group.title}
                  href={`#${toAnchor(group.title)}`}
                  className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                >
                  <span>{group.title}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {group.items.length}
                  </span>
                </a>
              ))}
            </nav>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Setup health
            </p>

            <h2 className="mt-3 text-xl font-semibold">Admin readiness</h2>

            <p className="mt-2 text-sm leading-6 text-slate-300">
              Start with platform defaults, feature catalog, security, and plan
              visibility before onboarding tenants.
            </p>
          </div>
        </aside>

        <div className="space-y-5">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Recommended
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">
                  Start here
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  These settings have the biggest impact on tenant setup and
                  platform behavior.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
                {recommendedSettings.length} priority areas
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {recommendedSettings.map((item) => (
                <SettingsCard
                  key={item.href}
                  {...item}
                  compact
                />
              ))}
            </div>
          </section>

          {settingsGroups.map((group) => (
            <SettingsSection
              key={group.title}
              title={group.title}
              description={group.description}
              items={group.items}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function toAnchor(value: string) {
  return value
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}