import Link from "next/link";
import {
  Building2,
  CreditCard,
  FileText,
  Mail,
  Palette,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Users,
  Workflow,
} from "lucide-react";
import { PageHeader } from "@/app/_components/ui/page-header";

type SettingsMenuItem = {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type SettingsMenuGroup = {
  title: string;
  description: string;
  items: SettingsMenuItem[];
};

const settingsGroups: SettingsMenuGroup[] = [
  {
    title: "Platform",
    description: "Core defaults and global system behavior.",
    items: [
      {
        title: "Platform defaults",
        description: "Manage default country, currency, timezone, and system-wide rules.",
        href: "/settings/platform-defaults",
        icon: Settings,
      },
      {
        title: "Feature catalog",
        description: "Control available modules, features, and platform capabilities.",
        href: "/settings/features",
        icon: Sparkles,
      },
      {
        title: "Security & access",
        description: "Configure roles, permissions, access policies, and admin behavior.",
        href: "/settings/security",
        icon: ShieldCheck,
      },
    ],
  },
  {
    title: "Lifecycle",
    description: "Lead, customer, onboarding, and tenant lifecycle configuration.",
    items: [
      {
        title: "Lead definitions",
        description: "Manage lead statuses, sub-statuses, sources, and qualification rules.",
        href: "/settings/lead-definitions",
        icon: Workflow,
      },
      {
        title: "Customer definitions",
        description: "Manage customer lifecycle stages, account rules, and readiness logic.",
        href: "/settings/customer-definitions",
        icon: Users,
      },
      {
        title: "Onboarding definitions",
        description: "Configure onboarding statuses, checklist rules, and tenant readiness.",
        href: "/settings/onboarding-definitions",
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    title: "Commercial",
    description: "Plans, billing, invoice, and payment defaults.",
    items: [
      {
        title: "Plans & visibility",
        description: "Control public plan visibility and default commercial options.",
        href: "/settings/plans",
        icon: Tags,
      },
      {
        title: "Billing defaults",
        description: "Manage billing cycles, taxes, currencies, and payment terms.",
        href: "/settings/billing",
        icon: CreditCard,
      },
      {
        title: "Invoice defaults",
        description: "Configure invoice numbering, prefixes, due dates, and invoice notes.",
        href: "/settings/invoices",
        icon: FileText,
      },
    ],
  },
  {
    title: "Branding & communication",
    description: "Public branding, email provider, and customer-facing identity.",
    items: [
      {
        title: "Branding",
        description: "Manage logo, colors, favicon, and platform visual identity.",
        href: "/settings/branding",
        icon: Palette,
      },
      {
        title: "Email provider",
        description: "Configure SMTP, sender identity, templates, and email delivery rules.",
        href: "/settings/email",
        icon: Mail,
      },
      {
        title: "Company profile",
        description: "Manage platform company name, address, and public business details.",
        href: "/settings/company-profile",
        icon: Building2,
      },
    ],
  },
];

export default async function SettingsPage() {
  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Platform settings"
        description="Manage global defaults, lifecycle rules, billing behavior, invoice numbering, branding, communication, and operational catalogs from one structured settings area."
      />

      <section className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Menu
          </p>

          <nav className="mt-4 space-y-2">
            {settingsGroups.map((group) => (
              <a
                key={group.title}
                href={`#${toAnchor(group.title)}`}
                className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              >
                {group.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className="space-y-6">
          {settingsGroups.map((group) => (
            <section
              key={group.title}
              id={toAnchor(group.title)}
              className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div>
                <h2 className="text-xl font-semibold text-slate-950">
                  {group.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {group.description}
                </p>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group rounded-3xl border border-slate-200 bg-slate-50 p-5 transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 ring-1 ring-slate-200 transition group-hover:bg-slate-950 group-hover:text-white">
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-950">
                            {item.title}
                          </h3>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {item.description}
                          </p>
                          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 group-hover:text-slate-700">
                            Open settings
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}

function toAnchor(value: string) {
  return value.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and");
}
