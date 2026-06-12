"use client";

import { ChevronDown } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { FormTabMetadata } from "@/lib/runtime/metadata-runtime.types";

const TAB_GAP = 8;
const MORE_RESERVE = 104;

export function ResponsiveRuntimeTabs({
  activeTabKey,
  onTabChange,
  tabs,
}: {
  readonly activeTabKey: string;
  readonly onTabChange: (tabKey: string) => void;
  readonly tabs: readonly FormTabMetadata[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tabs.length);
  const [moreOpen, setMoreOpen] = useState(false);
  const visibleTabs = tabs.slice(0, visibleCount);
  const overflowTabs = tabs.slice(visibleCount);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const recalculate = () => {
      const widths = Array.from(measure.children).map(
        (child) => (child as HTMLElement).getBoundingClientRect().width,
      );
      const available = container.getBoundingClientRect().width;
      let used = 0;
      let count = widths.length;

      for (let index = 0; index < widths.length; index += 1) {
        const remaining = widths.length - index - 1;
        const required =
          used +
          widths[index] +
          (index > 0 ? TAB_GAP : 0) +
          (remaining > 0 ? MORE_RESERVE + TAB_GAP : 0);
        if (required > available) {
          count = index;
          break;
        }
        used += widths[index] + (index > 0 ? TAB_GAP : 0);
      }

      setVisibleCount(Math.max(0, count));
    };

    const observer = new ResizeObserver(recalculate);
    observer.observe(container);
    observer.observe(measure);
    document.fonts?.ready.then(recalculate).catch(() => undefined);
    recalculate();

    return () => observer.disconnect();
  }, [tabs]);

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setMoreOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ),
    );
    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const delta = event.key === "ArrowDown" ? 1 : -1;
    items[(currentIndex + delta + items.length) % items.length]?.focus();
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -z-10 flex gap-2 opacity-0"
        ref={measureRef}
      >
        {tabs.map((tab) => (
          <TabButton
            active={false}
            key={tab.tabKey}
            onClick={() => undefined}
            tab={tab}
          />
        ))}
      </div>
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        {visibleTabs.map((tab) => (
          <TabButton
            active={tab.tabKey === activeTabKey}
            key={tab.tabKey}
            onClick={() => {
              setMoreOpen(false);
              onTabChange(tab.tabKey);
            }}
            tab={tab}
          />
        ))}
        {overflowTabs.length ? (
          <div className="relative shrink-0">
            <button
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground transition hover:border-accent"
              onClick={() => setMoreOpen((current) => !current)}
              type="button"
            >
              More
              <ChevronDown className="h-4 w-4" />
            </button>
            {moreOpen ? (
              <div
                className="absolute right-0 z-30 mt-2 min-w-max max-w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-white p-1 shadow-xl"
                onKeyDown={handleMenuKeyDown}
                role="menu"
              >
                {overflowTabs.map((tab) => (
                  <button
                    className={`flex w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      tab.tabKey === activeTabKey
                        ? "bg-accent text-white"
                        : "text-foreground hover:bg-muted/20"
                    }`}
                    disabled={tab.isDisabled}
                    key={tab.tabKey}
                    onClick={() => {
                      setMoreOpen(false);
                      onTabChange(tab.tabKey);
                    }}
                    role="menuitem"
                    title={tab.disabledReason}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  tab,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly tab: FormTabMetadata;
}) {
  return (
    <button
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-accent bg-accent text-white"
          : "border-border bg-white text-foreground hover:border-accent"
      }`}
      disabled={tab.isDisabled}
      onClick={onClick}
      title={tab.disabledReason}
      type="button"
    >
      {tab.label}
    </button>
  );
}
