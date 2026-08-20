"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavItem = { href: string; label: string };

/**
 * Site navigation.
 *
 * Client-side because three things here need to know the current route or hold
 * interaction state: the active-page marker, and the mobile menu's open state
 * and dismissal. `loginHref` is resolved on the server and passed in, because
 * it comes from `@repo/config` values that are not `NEXT_PUBLIC_`.
 *
 * BUG-0062: this was a bare `<details>` element. Selecting a destination
 * navigated but left the panel open — the header lives in the root layout, so
 * App Router never remounts it and the element's `open` property survived the
 * transition, covering the heading of the page the visitor had just asked for.
 * Escape did nothing either. A disclosure that cannot be dismissed is why this
 * is now controlled rather than native.
 */
export function HeaderNav({
  items,
  loginHref,
}: {
  items: readonly NavItem[];
  loginHref: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * Close on navigation — the actual fix for BUG-0062, since the layout is not
   * remounted between routes and nothing else would ever close it.
   *
   * Adjusted during render rather than in an effect. React documents this as
   * the pattern for resetting state when a value changes, and it is also the
   * better behaviour here: an effect runs *after* paint, so the new page would
   * flash with the old menu still covering it for a frame.
   */
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  // Escape closes and returns focus to the trigger, which is the standard
  // dismissal contract and the half a native <details> does not provide.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  /**
   * `aria-current="page"` is the only machine-readable statement of where the
   * visitor is; the styling below is its visible counterpart, never its
   * replacement.
   */
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/*
        The desktop navigation switches at `lg`, not `md`. At exactly 768px the
        six links plus Login plus the CTA did fit the bar only by wrapping the
        CTA label onto two lines — so the tablet breakpoint now uses the menu.
      */}
      <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
        {items.map((item) => (
          <Link
            aria-current={isCurrent(item.href) ? "page" : undefined}
            className={[
              "rounded-xl px-3 py-2 text-sm font-medium transition",
              isCurrent(item.href)
                ? "bg-surface-muted text-foreground"
                : "text-muted hover:bg-surface-muted hover:text-foreground",
            ].join(" ")}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="hidden items-center gap-2 lg:flex">
        <Link
          className="rounded-xl px-3 py-2 text-sm font-semibold text-muted transition hover:bg-surface-muted hover:text-foreground"
          href={loginHref}
        >
          Login
        </Link>
        <Link
          className="whitespace-nowrap rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
          href="/subscribe"
        >
          Start subscription
        </Link>
      </div>

      <div className="relative lg:hidden">
        <button
          aria-controls="site-mobile-menu"
          aria-expanded={open}
          className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground"
          onClick={() => setOpen((value) => !value)}
          ref={triggerRef}
          type="button"
        >
          Menu
        </button>

        {open ? (
          <div
            className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-border bg-white p-2 shadow-lg"
            id="site-mobile-menu"
            ref={panelRef}
          >
            <nav aria-label="Primary" className="grid">
              {items.map((item) => (
                <Link
                  aria-current={isCurrent(item.href) ? "page" : undefined}
                  className={[
                    "block rounded-xl px-3 py-2.5 text-sm font-medium",
                    isCurrent(item.href)
                      ? "bg-surface-muted text-foreground"
                      : "text-muted hover:bg-surface-muted hover:text-foreground",
                  ].join(" ")}
                  href={item.href}
                  key={item.href}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="my-2 border-t border-border" />
            <Link
              className="block rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface-muted hover:text-foreground"
              href={loginHref}
              onClick={() => setOpen(false)}
            >
              Login
            </Link>
            <Link
              className="mt-1 block rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white"
              href="/subscribe"
              onClick={() => setOpen(false)}
            >
              Start subscription
            </Link>
          </div>
        ) : null}
      </div>
    </>
  );
}
