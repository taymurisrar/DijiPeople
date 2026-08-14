import Link from "next/link";

import { TEAM_DAY_VIEWS, type TeamDayViewKey } from "../_lib/views";

/**
 * The named views, as links so a reviewer can share the one they are looking at.
 *
 * Each corresponds to a server-side predicate; switching view re-queries rather
 * than narrowing the rows already on screen.
 */
export function TeamDayViewTabs({
  current,
  search,
}: {
  current: TeamDayViewKey;
  search: string;
}) {
  return (
    <nav aria-label="Attendance review views" className="flex flex-wrap gap-2">
      {TEAM_DAY_VIEWS.map((view) => {
        const params = new URLSearchParams(search);
        params.set("view", view.key);
        // A new view means a new result set; page 3 of the last one is meaningless.
        params.delete("page");

        const active = view.key === current;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`rounded-2xl border px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "border-accent bg-accent text-white"
                : "border-border text-foreground hover:bg-surface-strong"
            }`}
            href={`/attendance/daily?${params.toString()}`}
            key={view.key}
            title={view.description}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
