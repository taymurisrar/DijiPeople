"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCurrentUserAccess } from "../../_components/authenticated-shell-provider";
import {
  findSettingsItemByPath,
  resolveVisibleSettingsGroups,
} from "../_lib/settings-navigation";

export function SettingsNav({ currentPath }: { currentPath: string }) {
  const { user } = useCurrentUserAccess();
  const visibleGroups = useMemo(
    () => resolveVisibleSettingsGroups(user.permissionKeys),
    [user.permissionKeys],
  );
  const currentMatch = findSettingsItemByPath(currentPath);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      visibleGroups.map((group) => [
        group.key,
        currentMatch ? currentMatch.group.key === group.key : true,
      ]),
    ),
  );

  return (
    <nav className="grid gap-3">
      {visibleGroups.map((group) => {
        const isOpen = openGroups[group.key] ?? false;
        const groupIsActive = currentMatch?.group.key === group.key;

        return (
          <section
            className="rounded-[22px] border border-border bg-white/80"
            key={group.key}
          >
            <button
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
              onClick={() =>
                setOpenGroups((current) => ({
                  ...current,
                  [group.key]: !isOpen,
                }))
              }
              type="button"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {group.label}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {group.items.length} section{group.items.length === 1 ? "" : "s"}
                </p>
              </div>
              {isOpen ? (
                <ChevronDown
                  className={`h-4 w-4 ${groupIsActive ? "text-accent" : "text-muted"}`}
                />
              ) : (
                <ChevronRight
                  className={`h-4 w-4 ${groupIsActive ? "text-accent" : "text-muted"}`}
                />
              )}
            </button>

            {isOpen ? (
              <div className="grid gap-2 border-t border-border px-3 py-3">
                {group.items.map((item) => {
                  const isActive =
                    currentPath === item.href ||
                    currentPath.startsWith(`${item.href}/`);

                  return (
                    <Link
                      className={`rounded-2xl border px-3 py-3 transition ${
                        isActive
                          ? "border-accent/20 bg-accent-soft text-foreground"
                          : "border-transparent bg-transparent text-foreground hover:border-border hover:bg-surface"
                      }`}
                      href={item.href}
                      key={item.href}
                    >
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-1 text-xs text-muted">{item.description}</p>
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
