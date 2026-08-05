"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Bug,
  DatabaseBackup,
  CreditCard,
  FileText,
  FileSignature,
  Handshake,
  Headphones,
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
        description:
          "Country, currency, timezone, locale, and global behavior.",
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
      {
        title: "Users & access",
        description:
          "Manage platform admins, members, roles, and account status.",
        href: "/settings/users",
        icon: Users,
        badge: "Core",
      },
      {
        title: "Monitoring",
        description: "Platform error logs and operational diagnostics.",
        href: "/settings/monitoring/error-logs",
        icon: Bug,
        badge: "Advanced",
      },
      {
        title: "Demo data",
        description:
          "Review, remove, and recreate the tagged client-demo tenant.",
        href: "/settings/demo-data",
        icon: DatabaseBackup,
        badge: "Advanced",
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
      {
        title: "Partner policies",
        description: "Onboarding, activation, agreements, commissions, and submitted leads.",
        href: "/settings/partners",
        icon: Handshake,
        badge: "Core",
      },
      {
        title: "Customer activation",
        description: "Agreement, commercial approval, provisioning, and activation gates.",
        href: "/settings/customers",
        icon: Users,
        badge: "Core",
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
      {
        title: "Contracts & agreements",
        description: "Templates, approvals, signatures, consent, expiry, and renewal rules.",
        href: "/settings/contracts",
        icon: FileSignature,
        badge: "Core",
      },
      {
        title: "Support case policy",
        description: "Case numbering, severity targets, SLA, escalation, and closure.",
        href: "/settings/support",
        icon: Headphones,
        badge: "Recommended",
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

export default function SettingsPage() {
  const [query, setQuery] = useState("");
  const visibleGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return settingsGroups;

    return settingsGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          [group.title, group.description, item.title, item.description]
            .join(" ")
            .toLowerCase()
            .includes(normalized),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [query]);

  const visibleRecommended = useMemo(() => {
    if (!query.trim()) return recommendedSettings;
    const visibleHrefs = new Set(
      visibleGroups.flatMap((group) => group.items.map((item) => item.href)),
    );
    return recommendedSettings.filter((item) => visibleHrefs.has(item.href));
  }, [query, visibleGroups]);

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
                placeholder="Search settings..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-primary)] focus:bg-white focus:ring-4 focus:ring-blue-100/50"
              />
            </div>

            <nav className="mt-5 space-y-1">
              {visibleGroups.map((group) => (
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

          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,var(--admin-navigation),var(--admin-primary))] p-5 text-white shadow-sm">
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
                {visibleRecommended.length} priority areas
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {visibleRecommended.map((item) => (
                <SettingsCard key={item.href} {...item} compact />
              ))}
            </div>
          </section>

          {visibleGroups.map((group) => (
            <SettingsSection
              key={group.title}
              title={group.title}
              description={group.description}
              items={group.items}
            />
          ))}

          {visibleGroups.length === 0 ? (
            <section className="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">No settings found</h2>
              <p className="mt-2 text-sm text-slate-600">Try a feature name such as currency, theme, security, or invoice.</p>
              <button type="button" onClick={() => setQuery("")} className="mt-5 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                Clear search
              </button>
            </section>
          ) : null}
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
