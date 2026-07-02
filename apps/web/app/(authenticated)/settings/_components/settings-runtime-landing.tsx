"use client";

import Link from "next/link";
import { ChevronRight, FolderCog, Settings2 } from "lucide-react";
import { useCurrentUserAccess } from "../../_components/authenticated-shell-provider";
import type {
  SettingsRuntimeCategory,
  SettingsRuntimeGroup,
} from "../_lib/settings-runtime";
import { resolveVisibleSettingsRuntime } from "../_lib/settings-runtime";
import { canViewSettingsItem } from "../_lib/settings-navigation";
import { SettingsShell } from "./settings-shell";
import { AccessDeniedState } from "../../_components/access-denied-state";

export function SettingsWorkspaceLanding() {
  const { user } = useCurrentUserAccess();
  const categories = resolveVisibleSettingsRuntime(
    user?.permissionKeys ?? [],
    user?.roleKeys ?? [],
  );
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-[28px] border border-border bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Tenant Settings
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            Configuration workspace
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
            Configure the organization through structured categories and
            reusable setting groups.
          </p>
        </section>
        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <Link
              key={category.key}
              href={category.route}
              className="group rounded-[24px] border border-border bg-white p-6 shadow-sm transition hover:border-accent/30 hover:shadow-md"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <FolderCog className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-lg font-semibold text-foreground">
                {category.label}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {category.description}
              </p>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-accent">
                {category.groups.length} configuration groups
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

export function SettingsCategoryLanding({
  category,
}: {
  category: SettingsRuntimeCategory;
}) {
  const { user } = useCurrentUserAccess();
  const permissions = user?.permissionKeys ?? [];
  const roles = user?.roleKeys ?? [];
  const groups = category.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        canViewSettingsItem(permissions, roles, item),
      ),
    }))
    .filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return (
      <AccessDeniedState
        title="Access denied"
        description={`You do not have access to ${category.label} settings.`}
      />
    );
  }

  return (
    <SettingsShell
      title={category.label}
      description={category.description}
      eyebrow="Settings"
    >
      <div className="grid gap-5 xl:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.key}
            className="rounded-[24px] border border-border bg-white p-5 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <FolderCog className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={group.route}
                  className="font-semibold text-foreground hover:text-accent"
                >
                  {group.label}
                </Link>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {group.description}
                </p>
              </div>
            </div>
            <div className="mt-4 divide-y divide-border/70 border-t border-border/70">
              {group.items.map((item) => (
                <Link
                  key={item.key}
                  href={item.route}
                  className="flex items-center justify-between gap-3 py-3 text-sm hover:text-accent"
                >
                  <span>
                    <span className="font-medium">{item.label}</span>
                    <span className="mt-0.5 line-clamp-1 block text-xs text-muted">
                      {item.description}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </SettingsShell>
  );
}

export function SettingsGroupLanding({
  category,
  group,
}: {
  category: SettingsRuntimeCategory;
  group: SettingsRuntimeGroup;
}) {
  const { user } = useCurrentUserAccess();
  const items = group.items.filter((item) =>
    canViewSettingsItem(user?.permissionKeys ?? [], user?.roleKeys ?? [], item),
  );
  if (items.length === 0) {
    return (
      <AccessDeniedState
        title="Access denied"
        description={`You do not have access to ${group.label} settings.`}
      />
    );
  }
  return (
    <SettingsShell
      title={group.label}
      description={group.description}
      eyebrow={category.label}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.route}
            className="group rounded-[22px] border border-border bg-white p-5 shadow-sm transition hover:border-accent/30 hover:shadow-md"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface text-muted group-hover:bg-accent-soft group-hover:text-accent">
              <Settings2 className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-semibold text-foreground">{item.label}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {item.description}
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-accent">
              Open configuration
            </p>
          </Link>
        ))}
      </div>
    </SettingsShell>
  );
}
