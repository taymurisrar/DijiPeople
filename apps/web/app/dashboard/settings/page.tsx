"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AppWindow,
  BadgeCheck,
  Banknote,
  Bell,
  BookOpen,
  Building,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Columns3,
  Copy,
  FileCheck,
  FileCog,
  FileStack,
  FileText,
  FormInput,
  GitBranch,
  Globe2,
  History,
  KeyRound,
  Landmark,
  Layers3,
  LayoutGrid,
  ListTree,
  LockKeyhole,
  MapPinned,
  MonitorSmartphone,
  MonitorUp,
  Network,
  Paintbrush,
  Palette,
  Percent,
  Plane,
  Receipt,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Split,
  Table2,
  TimerReset,
  ToggleRight,
  UserCog,
  UserLock,
  UserPlus,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";
import { useCurrentUserAccess } from "../_components/authenticated-shell-provider";
import {
  canViewSettingsItem,
  resolveVisibleSettingsGroups,
  type SettingsBadge,
  type SettingsNavItem,
} from "./_lib/settings-navigation";

const iconMap = {
  "app-window": AppWindow,
  "badge-check": BadgeCheck,
  banknote: Banknote,
  bell: Bell,
  "book-open": BookOpen,
  building: Building,
  "building-2": Building2,
  "calendar-clock": CalendarClock,
  "calendar-days": CalendarDays,
  "clipboard-check": ClipboardCheck,
  "clock-3": Clock3,
  "columns-3": Columns3,
  copy: Copy,
  "file-check": FileCheck,
  "file-cog": FileCog,
  "file-stack": FileStack,
  "file-text": FileText,
  "form-input": FormInput,
  "git-branch": GitBranch,
  "globe-2": Globe2,
  history: History,
  "key-round": KeyRound,
  landmark: Landmark,
  "layers-3": Layers3,
  "layout-grid": LayoutGrid,
  "list-tree": ListTree,
  "lock-keyhole": LockKeyhole,
  "map-pinned": MapPinned,
  "monitor-smartphone": MonitorSmartphone,
  "monitor-up": MonitorUp,
  network: Network,
  paintbrush: Paintbrush,
  palette: Palette,
  percent: Percent,
  plane: Plane,
  receipt: Receipt,
  "settings-2": Settings2,
  shield: Shield,
  "shield-check": ShieldCheck,
  "sliders-horizontal": SlidersHorizontal,
  split: Split,
  "table-2": Table2,
  "timer-reset": TimerReset,
  "toggle-right": ToggleRight,
  "user-cog": UserCog,
  "user-lock": UserLock,
  "user-plus": UserPlus,
  users: Users,
  wallet: Wallet,
  workflow: Workflow,
} as const;

export default function SettingsPage() {
  const { user } = useCurrentUserAccess();
  const [query, setQuery] = useState("");

  const permissionKeys = useMemo(() => {
    return user?.permissionKeys ?? [];
  }, [user?.permissionKeys]);
  const normalizedQuery = query.trim().toLowerCase();

  const visibleGroups = useMemo(
    () =>
      resolveVisibleSettingsGroups(permissionKeys, {
        includeRestricted: true,
      }),
    [permissionKeys],
  );

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return visibleGroups;

    return visibleGroups
      .map((group) => {
        const groupMatches =
          group.label.toLowerCase().includes(normalizedQuery) ||
          group.summary.toLowerCase().includes(normalizedQuery);

        const items = group.items.filter((item) => {
          const badge = "badge" in item ? item.badge : undefined;

          const searchableText = [
            item.label,
            "shortLabel" in item ? item.shortLabel : undefined,
            item.description,
            group.label,
            group.summary,
            badge,
            ...item.keywords,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return groupMatches || searchableText.includes(normalizedQuery);
        });

        return {
          ...group,
          items,
        };
      })
      .filter((group) => group.items.length > 0);
  }, [normalizedQuery, visibleGroups]);

  const totalItems = visibleGroups.reduce(
    (count, group) => count + group.items.length,
    0,
  );

  const visibleItems = filteredGroups.reduce(
    (count, group) => count + group.items.length,
    0,
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-7 text-white sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
                  <Settings2 className="h-3.5 w-3.5" />
                  Enterprise Administration
                </div>

                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Settings
                </h1>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Configure organization structure, security, people rules,
                  payroll, customization, apps, appearance, and audit controls
                  from one governed workspace.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex">
                <MetricCard label="Groups" value={visibleGroups.length} />
                <MetricCard label="Settings" value={totalItems} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-6 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xl">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search settings, users, roles, payroll, branding, leave..."
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 lg:justify-start">
              <span>
                Showing{" "}
                <strong className="font-semibold text-slate-950">
                  {visibleItems}
                </strong>{" "}
                of{" "}
                <strong className="font-semibold text-slate-950">
                  {totalItems}
                </strong>
              </span>

              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="font-medium text-slate-950 hover:underline"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {filteredGroups.length === 0 ? (
          <section className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
              <Search className="h-5 w-5 text-slate-500" />
            </div>

            <h2 className="mt-4 text-lg font-semibold text-slate-950">
              No settings found
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Try searching for users, roles, payroll, branding, leave,
              attendance, departments, permissions, or customization.
            </p>
          </section>
        ) : (
          <div className="grid gap-6">
            {filteredGroups.map((group) => (
              <SettingsGroupBlock
                key={group.key}
                group={group}
                permissionKeys={permissionKeys}
              />))}
          </div>
        )}
      </div>
    </main>
  );
}

function SettingsGroupBlock({
  group,
  permissionKeys,
}: {
  group: ReturnType<typeof resolveVisibleSettingsGroups>[number];
  permissionKeys: readonly string[];
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
            <SettingsIcon icon={group.icon} className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {group.label}
            </h2>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              {group.summary}
            </p>
          </div>
        </div>

        <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
          {group.items.length} item{group.items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {group.items.map((item) => (
          <SettingsCard
            key={item.key}
            item={item}
            permissionKeys={permissionKeys}
          />
        ))}
      </div>
    </section>
  );
}

function SettingsCard({
  item,
  permissionKeys,
}: {
  item: SettingsNavItem;
  permissionKeys: readonly string[];
}) {
  const isDisabled = "disabled" in item ? item.disabled === true : false;
  const badge = "badge" in item ? item.badge : undefined;
  const canOpen = canViewSettingsItem(permissionKeys, item);

  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition group-hover:bg-white group-hover:text-slate-950">
          <SettingsIcon icon={item.icon} className="h-4 w-4" />
        </div>

        {badge ? <Badge label={badge} /> : null}
      </div>

      <h3 className="mt-4 text-sm font-semibold text-slate-950">
        {item.label}
      </h3>

      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">
        {item.description}
      </p>

      <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-slate-400 transition group-hover:text-slate-950">
        {isDisabled ? "Coming soon" : canOpen ? "Open settings" : "Restricted"}
        {!isDisabled && canOpen ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : null}
      </div>
    </>
  );

  if (isDisabled || !canOpen) {
    return (
      <div className="group cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-50/70 p-4 opacity-70">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm focus:outline-none focus:ring-4 focus:ring-slate-100"
    >
      {content}
    </Link>
  );
}

function Badge({ label }: { label: SettingsBadge }) {
  const className =
    label === "Core"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : label === "Advanced"
        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
        : label === "New"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : label === "Preview"
            ? "border-slate-200 bg-slate-50 text-slate-600"
            : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="text-xs font-medium text-slate-300">{label}</div>
    </div>
  );
}

function SettingsIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const Icon = iconMap[icon as keyof typeof iconMap] ?? Settings2;

  return <Icon className={className} />;
}