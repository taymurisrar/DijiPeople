"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { RelatedTabMetadata } from "../../../lib/runtime/metadata-runtime.types";

export function ModuleRelatedTabs({
  activeTabKey,
  baseHref,
  children,
  tabs,
}: {
  readonly activeTabKey: string;
  readonly baseHref: string;
  readonly children: ReactNode;
  readonly tabs: readonly RelatedTabMetadata[];
}) {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {tabs
          .filter((tab) => tab.isVisible !== false)
          .sort((left, right) => left.order - right.order)
          .map((tab) => {
            const isActive = tab.tabKey === activeTabKey;

            return (
              <Link
                aria-disabled={tab.isDisabled}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-white text-foreground hover:border-accent"
                } ${tab.isDisabled ? "pointer-events-none opacity-50" : ""}`}
                href={`${baseHref}?tab=${tab.tabKey}`}
                key={tab.tabKey}
                title={tab.disabledReason}
              >
                {tab.label}
              </Link>
            );
          })}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
