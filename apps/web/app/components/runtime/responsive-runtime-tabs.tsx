"use client";

import { ChevronDown } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { FormTabMetadata } from "@/lib/runtime/metadata-runtime.types";

const TAB_GAP = 8;
const MORE_RESERVE = 104;

/**
 * BUG-3378 — id contract with the panel this strip controls.
 *
 * The panel that swaps content per tab is rendered by the caller
 * (`runtime-metadata-form-renderer.tsx`), not by this component, so the two
 * sides need one shared way to derive the same ids rather than each
 * reconstructing them and risking drift. `idPrefix` is the caller's own
 * `useId()` value — stable across renders and unique per mounted form, so two
 * forms on the same page never collide.
 */
export function getResponsiveTabId(idPrefix: string, tabKey: string): string {
  return `${idPrefix}-tab-${tabKey}`;
}

export function getResponsiveTabPanelId(idPrefix: string): string {
  return `${idPrefix}-tabpanel`;
}

/**
 * The roving-tabindex arrow-key math, pulled out as a pure function so the
 * wrap-around and Home/End cases have a regression test that does not need a
 * rendered DOM (`apps/web`'s jest has no jsdom — see `jest.config.js`).
 *
 * `currentIndex` of `-1` (the active tab is not among the selectable ones —
 * disabled, or mid-collapse into the overflow menu) is treated as "before the
 * first", so `ArrowRight` still lands somewhere rather than doing nothing.
 */
export function resolveNextTabIndex(
  key: "ArrowRight" | "ArrowLeft" | "Home" | "End",
  currentIndex: number,
  count: number,
): number {
  if (count <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;

  const delta = key === "ArrowRight" ? 1 : -1;
  const from = currentIndex === -1 ? 0 : currentIndex;
  return (from + delta + count) % count;
}

export function ResponsiveRuntimeTabs({
  activeTabKey,
  idPrefix,
  onTabChange,
  tabs,
}: {
  readonly activeTabKey: string;
  readonly idPrefix: string;
  readonly onTabChange: (tabKey: string) => void;
  readonly tabs: readonly FormTabMetadata[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [visibleCount, setVisibleCount] = useState(tabs.length);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    readonly right: number;
    readonly top: number;
  } | null>(null);
  const visibleTabs = tabs.slice(0, visibleCount);
  const overflowTabs = tabs.slice(visibleCount);
  const moreMenu =
    moreOpen && menuPosition
      ? createPortal(
          <div
            className="fixed z-50 min-w-max max-w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-white p-1 shadow-xl"
            onKeyDown={handleMenuKeyDown}
            role="menu"
            // A `menu` handles its own arrow-key navigation, so it must be able
            // to receive focus to hear those keys at all. -1 keeps it out of the
            // tab order: it is opened from the trigger, not tabbed to. BUG-0043.
            tabIndex={-1}
            style={{
              right: menuPosition.right,
              top: menuPosition.top,
            }}
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
          </div>,
          document.body,
        )
      : null;

  useEffect(() => {
    if (!moreOpen) return;

    const updatePosition = () => {
      const button = moreButtonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      setMenuPosition({
        right: Math.max(16, window.innerWidth - rect.right),
        top: rect.bottom + 8,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [moreOpen]);

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

  /*
   * BUG-3378 — roving tabindex per the WAI-ARIA tabs pattern: only the
   * selected tab is a Tab stop (`tabIndex=0` below), so arrow keys are what
   * move between tabs while the strip itself remains a single stop in the
   * page's Tab order. Disabled tabs are skipped, matching the same skip the
   * overflow menu already applies to its own items just above.
   *
   * Selection moves with focus (WAI-ARIA's "automatic activation") rather
   * than requiring a separate Enter/Space, which matches how these tabs
   * already behaved on click before this fix.
   */
  function handleTabListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.key !== "ArrowRight" &&
      event.key !== "ArrowLeft" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    const selectable = visibleTabs.filter((tab) => !tab.isDisabled);
    if (selectable.length === 0) return;
    event.preventDefault();

    const currentIndex = selectable.findIndex(
      (tab) => tab.tabKey === activeTabKey,
    );
    const nextIndex = resolveNextTabIndex(
      event.key,
      currentIndex,
      selectable.length,
    );

    const next = selectable[nextIndex];
    if (!next) return;

    setMoreOpen(false);
    onTabChange(next.tabKey);
    tablistRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab-key="${next.tabKey}"]`)
      ?.focus();
  }

  return (
    <div className="relative w-full min-w-0 overflow-hidden" ref={containerRef}>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 -z-10 flex h-0 gap-2 overflow-hidden opacity-0"
        /*
         * BUG-3378 — `aria-hidden` only tells assistive technology to skip
         * this subtree; it does nothing to the tab order, so its buttons were
         * still thirteen live keyboard stops for a purely visual measurement
         * copy. `inert` removes it from focus and interaction the same way it
         * is already removed from the accessibility tree.
         */
        inert
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
      <div
        aria-label="Record sections"
        className="flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-hidden"
        onKeyDown={handleTabListKeyDown}
        ref={tablistRef}
        role="tablist"
        // The tablist itself is not a Tab stop under the roving-tabindex
        // pattern — focus lives on the selected tab (tabIndex 0 there) — but
        // it does own the arrow-key handling above, and eslint-plugin-jsx-a11y
        // requires an element carrying keyboard handlers to declare a
        // tabIndex. -1 keeps it reachable by script without adding a second
        // Tab stop next to the tab it already delegates to.
        tabIndex={-1}
      >
        {visibleTabs.map((tab) => {
          const active = tab.tabKey === activeTabKey;
          return (
            <TabButton
              active={active}
              id={getResponsiveTabId(idPrefix, tab.tabKey)}
              key={tab.tabKey}
              onClick={() => {
                setMoreOpen(false);
                onTabChange(tab.tabKey);
              }}
              panelId={getResponsiveTabPanelId(idPrefix)}
              tab={tab}
            />
          );
        })}
        {overflowTabs.length ? (
          <div className="relative shrink-0">
            <button
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground transition hover:border-accent"
              onClick={() => setMoreOpen((current) => !current)}
              ref={moreButtonRef}
              type="button"
            >
              More
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
      {moreMenu}
    </div>
  );
}

function TabButton({
  active,
  id,
  onClick,
  panelId,
  tab,
}: {
  readonly active: boolean;
  readonly id?: string;
  readonly onClick: () => void;
  readonly panelId?: string;
  readonly tab: FormTabMetadata;
}) {
  // `role="tab"` only when this copy is wired to a real panel (the visible
  // strip) — the hidden measurement copy renders the same button shape purely
  // to get its width, and giving it tab semantics too would double every
  // announced tab count.
  const isRealTab = id !== undefined && panelId !== undefined;

  return (
    <button
      aria-controls={isRealTab ? panelId : undefined}
      aria-selected={isRealTab ? active : undefined}
      className={`shrink-0 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-accent bg-accent text-white"
          : "border-border bg-white text-foreground hover:border-accent"
      }`}
      data-tab-key={isRealTab ? tab.tabKey : undefined}
      disabled={tab.isDisabled}
      id={id}
      onClick={onClick}
      role={isRealTab ? "tab" : undefined}
      tabIndex={isRealTab ? (active ? 0 : -1) : undefined}
      title={tab.disabledReason}
      type="button"
    >
      {tab.label}
    </button>
  );
}
