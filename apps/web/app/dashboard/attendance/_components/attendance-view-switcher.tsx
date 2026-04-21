import Link from "next/link";
import { AttendanceView } from "../types";

export function AttendanceViewSwitcher({
  basePath,
  currentView,
  queryString,
}: {
  basePath: string;
  currentView: AttendanceView;
  queryString: string;
}) {
  const views: AttendanceView[] = ["day", "week", "month"];

  return (
    <div className="inline-flex rounded-2xl border border-border bg-white p-1">
      {views.map((view) => {
        const params = new URLSearchParams(queryString);
        params.set("view", view);
        params.delete("page");
        const isActive = currentView === view;

        return (
          <Link
            key={view}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
            href={`${basePath}?${params.toString()}`}
          >
            {view.charAt(0).toUpperCase() + view.slice(1)}
          </Link>
        );
      })}
    </div>
  );
}
