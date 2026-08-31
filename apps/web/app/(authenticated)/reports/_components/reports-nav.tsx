import Link from "next/link";
import {
  isReportsNavItemActive,
  type ReportsNavItem,
} from "../_lib/reports-nav-model";

/*
 * The reporting sub-navigation.
 *
 * Structurally the payroll nav (`payroll/_components/payroll-nav.tsx`),
 * including the detail BUG-1668 was about: the pill row wraps, so a 390px
 * screen breaks it onto several lines instead of pushing it past the viewport.
 *
 * It is not a `DashboardNavItem` and does not try to be. That type is flat and
 * has no concept of children; the sidebar carries one "Reports & Analytics"
 * entry and this row carries the sections underneath it, exactly as Payroll
 * does. Adding a children concept to the sidebar to express one module's
 * sections would change a type every module depends on.
 *
 * The active-path rule lives in `_lib/reports-nav-model.ts`, where a node-only
 * jest can reach it.
 */

export type { ReportsNavItem };

export function ReportsNav({
  currentPath,
  items,
}: {
  currentPath: string;
  items: readonly ReportsNavItem[];
}) {
  return (
    <nav aria-label="Reports sections" className="flex flex-wrap gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-background p-1">
        {items.map((item) => {
          const isActive = isReportsNavItemActive(currentPath, item.href);

          return (
            <Link
              key={item.href}
              aria-current={isActive ? "page" : undefined}
              aria-label={item.ariaLabel}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? "bg-surface text-accent shadow-sm"
                  : "text-muted hover:bg-surface hover:text-foreground"
              }`}
              href={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
