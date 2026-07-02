"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, FolderCog } from "lucide-react";
import { useMemo, useState } from "react";
import { useCurrentUserAccess } from "../../_components/authenticated-shell-provider";
import {
  getSettingsRuntimeItemByPath,
  resolveVisibleSettingsRuntime,
} from "../_lib/settings-runtime";

export function SettingsRuntimeNav({
  currentPath,
  isCollapsed = false,
}: {
  currentPath: string;
  isCollapsed?: boolean;
}) {
  const { user } = useCurrentUserAccess();
  const categories = useMemo(
    () =>
      resolveVisibleSettingsRuntime(
        user?.permissionKeys ?? [],
        user?.roleKeys ?? [],
      ),
    [user?.permissionKeys, user?.roleKeys],
  );
  const currentItem = getSettingsRuntimeItemByPath(currentPath);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        categories.map((category) => [
          category.key,
          category.key === currentItem?.category,
        ]),
      ),
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    currentItem
      ? { [`${currentItem.category}:${currentItem.group}`]: true }
      : {},
  );

  if (isCollapsed) {
    return (
      <nav aria-label="Settings navigation" className="grid gap-3">
        {categories.map((category) => (
          <Link
            key={category.key}
            href={category.route}
            title={category.label}
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-white text-muted hover:text-accent"
          >
            <FolderCog className="h-4 w-4" />
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Settings navigation" className="grid gap-3">
      {categories.map((category) => {
        const categoryOpen = openCategories[category.key] ?? false;
        return (
          <section
            key={category.key}
            className="overflow-hidden rounded-[20px] border border-border bg-white/90"
          >
            <div className="flex items-center gap-2 px-3 py-3">
              <button
                type="button"
                aria-expanded={categoryOpen}
                onClick={() =>
                  setOpenCategories((state) => ({
                    ...state,
                    [category.key]: !categoryOpen,
                  }))
                }
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface"
              >
                {categoryOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              <Link
                href={category.route}
                className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground"
              >
                {category.label}
              </Link>
            </div>
            {categoryOpen ? (
              <div className="border-t border-border px-3 py-2">
                {category.groups.map((group) => {
                  const groupStateKey = `${category.key}:${group.key}`;
                  const groupOpen = openGroups[groupStateKey] ?? false;
                  return (
                    <div key={group.key} className="py-1">
                      <button
                        type="button"
                        aria-expanded={groupOpen}
                        onClick={() =>
                          setOpenGroups((state) => ({
                            ...state,
                            [groupStateKey]: !groupOpen,
                          }))
                        }
                        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-medium text-muted hover:bg-surface hover:text-foreground"
                      >
                        {groupOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        <span>{group.label}</span>
                      </button>
                      {groupOpen ? (
                        <div className="ml-5 border-l border-border pl-2">
                          {group.items.map((item) => {
                            const active = currentItem?.key === item.key;
                            return (
                              <Link
                                key={item.key}
                                href={item.route}
                                aria-current={active ? "page" : undefined}
                                className={`block rounded-lg px-2 py-2 text-xs ${active ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-surface hover:text-foreground"}`}
                              >
                                {item.label}
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
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
