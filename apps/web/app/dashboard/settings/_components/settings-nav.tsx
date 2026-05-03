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
  ChevronDown,
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
import { useCurrentUserAccess } from "../../_components/authenticated-shell-provider";
import {
  findSettingsItemByPath,
  resolveVisibleSettingsGroups,
  type SettingsBadge,
} from "../_lib/settings-navigation";

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

function getIcon(icon: string) {
  return iconMap[icon as keyof typeof iconMap] ?? Settings2;
}

export function SettingsNav({ currentPath }: { currentPath: string }) {
  const { user } = useCurrentUserAccess();

  const permissionKeys = user?.permissionKeys ?? [];

  const visibleGroups = useMemo(
    () => resolveVisibleSettingsGroups(permissionKeys),
    [permissionKeys],
  );

  const currentMatch = findSettingsItemByPath(currentPath);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      visibleGroups.map((group) => [
        group.key,
        currentMatch ? currentMatch.groupKey === group.key : true,
      ]),
    ),
  );

  if (visibleGroups.length === 0) {
    return (
      <div className="rounded-[22px] border border-dashed border-border bg-white/80 p-5">
        <p className="text-sm font-semibold text-foreground">
          No settings available
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Your current role does not have access to any settings areas.
        </p>
      </div>
    );
  }

  return (
    <nav aria-label="Settings navigation" className="grid gap-3">
      {visibleGroups.map((group) => {
        const isOpen = openGroups[group.key] ?? false;
        const groupIsActive = currentMatch?.groupKey === group.key;
        const GroupIcon = getIcon(group.icon);

        return (
          <section
            className={`overflow-hidden rounded-[22px] border bg-white/85 transition ${groupIsActive
                ? "border-accent/30 shadow-sm"
                : "border-border"
              }`}
            key={group.key}
          >
            <button
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
              onClick={() =>
                setOpenGroups((current) => ({
                  ...current,
                  [group.key]: !isOpen,
                }))
              }
              type="button"
            >
              <span className="flex min-w-0 items-start gap-3">
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${groupIsActive
                      ? "border-accent/20 bg-accent-soft text-accent"
                      : "border-border bg-surface text-muted"
                    }`}
                >
                  <GroupIcon className="h-4 w-4" />
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {group.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {group.items.length} item
                    {group.items.length === 1 ? "" : "s"}
                  </span>
                </span>
              </span>

              {isOpen ? (
                <ChevronDown
                  className={`h-4 w-4 shrink-0 ${groupIsActive ? "text-accent" : "text-muted"
                    }`}
                />
              ) : (
                <ChevronRight
                  className={`h-4 w-4 shrink-0 ${groupIsActive ? "text-accent" : "text-muted"
                    }`}
                />
              )}
            </button>

            {isOpen ? (
              <div className="grid gap-2 border-t border-border px-3 py-3">
                {group.items.map((item) => {
                  const ItemIcon = getIcon(item.icon);

                  const isDisabled = "disabled" in item ? item.disabled === true : false;
                  const badge = "badge" in item ? item.badge : undefined;

                  const isActive =
                    currentPath === item.href ||
                    currentPath.startsWith(`${item.href}/`);

                  if (isDisabled) {
                    return (
                      <div
                        aria-disabled="true"
                        className="rounded-2xl border border-border/70 bg-surface/50 px-3 py-3 opacity-70"
                        key={item.key}
                      >
                        <SettingsNavItemContent
                          badge={badge}
                          description={item.description}
                          icon={<ItemIcon className="h-4 w-4" />}
                          label={item.label}
                          muted
                        />
                      </div>
                    );
                  }

                  return (
                    <Link
                      aria-current={isActive ? "page" : undefined}
                      className={`rounded-2xl border px-3 py-3 transition ${isActive
                          ? "border-accent/25 bg-accent-soft text-foreground shadow-sm"
                          : "border-transparent bg-transparent text-foreground hover:border-border hover:bg-surface"
                        }`}
                      href={item.href}
                      key={item.key}
                    >
                      <SettingsNavItemContent
                        badge={badge}
                        description={item.description}
                        icon={<ItemIcon className="h-4 w-4" />}
                        label={item.label}
                      />
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </nav>
  );
}

function SettingsNavItemContent({
  badge,
  description,
  icon,
  label,
  muted = false,
}: {
  badge?: SettingsBadge;
  description: string;
  icon: React.ReactNode;
  label: string;
  muted?: boolean;
}) {
  return (
    <span className="flex gap-3">
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${muted
            ? "border-border bg-white text-muted"
            : "border-border bg-white text-muted"
          }`}
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          {badge ? <SettingsBadgePill badge={badge} /> : null}
        </span>

        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted">
          {description}
        </span>
      </span>
    </span>
  );
}

function SettingsBadgePill({ badge }: { badge: SettingsBadge }) {
  const className =
    badge === "Core"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : badge === "Admin"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : badge === "Advanced"
          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
          : badge === "New"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}
    >
      {badge}
    </span>
  );
}