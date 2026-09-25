import Link from "next/link";
import {
  Activity,
  Database,
  KeyRound,
  Layers,
  Mail,
  HardDrive,
  Send,
} from "lucide-react";

export type HealthComponentStatus = "OK" | "DEGRADED" | "DOWN" | "UNKNOWN";

export type HealthComponent = {
  status: HealthComponentStatus;
  reason: string;
  drillDownHref: string | null;
  [key: string]: unknown;
};

export type PlatformHealth = {
  status: HealthComponentStatus;
  timestamp: string;
  components: {
    api: HealthComponent;
    database: HealthComponent;
    backgroundProcessing: HealthComponent;
    notificationQueue: HealthComponent;
    authentication: HealthComponent;
    storage: HealthComponent;
    email: HealthComponent;
  };
};

const TILES: Array<{
  key: keyof PlatformHealth["components"];
  label: string;
  icon: typeof Activity;
}> = [
  { key: "api", label: "API", icon: Activity },
  { key: "database", label: "Database", icon: Database },
  { key: "backgroundProcessing", label: "Background jobs", icon: Layers },
  { key: "notificationQueue", label: "Notification queue", icon: Send },
  { key: "authentication", label: "Authentication", icon: KeyRound },
  { key: "storage", label: "Storage", icon: HardDrive },
  { key: "email", label: "Email", icon: Mail },
];

const STATUS_TONE: Record<
  HealthComponentStatus,
  { badge: string; ring: string; label: string }
> = {
  OK: {
    badge: "bg-emerald-50 text-emerald-700",
    ring: "border-slate-200",
    label: "OK",
  },
  DEGRADED: {
    badge: "bg-amber-50 text-amber-700",
    ring: "border-amber-300",
    label: "Degraded",
  },
  DOWN: {
    badge: "bg-rose-50 text-rose-700",
    ring: "border-rose-300",
    label: "Down",
  },
  UNKNOWN: {
    badge: "bg-slate-100 text-slate-600",
    ring: "border-slate-200",
    label: "Unknown",
  },
};

/**
 * TASK-0032 WP-06. "Is the platform healthy" as the first thing on the
 * monitoring page, not something inferred from an error queue. Every field
 * comes from `GET /platform/monitoring/health` — a real `SELECT 1`, a real
 * outbox count, a real storage readiness probe — never a hardcoded OK. A
 * component this platform genuinely cannot measure (the notification queue:
 * there is no deployed async queue, only a synchronous fallback) says
 * `UNKNOWN` and names why, rather than a green tile that would be a guess.
 */
export function HealthOverviewTiles({ health }: { health: PlatformHealth }) {
  const overall = STATUS_TONE[health.status];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${overall.badge}`}
          >
            Platform {overall.label}
          </span>
          <span className="text-xs text-slate-400">
            Checked{" "}
            {new Date(health.timestamp).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TILES.map(({ key, label, icon: Icon }) => {
          const component = health.components[key];
          const tone = STATUS_TONE[component.status];
          const content = (
            <div
              className={`flex h-full flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm transition ${tone.ring} ${component.drillDownHref ? "hover:border-slate-300 hover:shadow" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.badge}`}
                >
                  {tone.label}
                </span>
              </div>
              <p className="text-xs text-slate-600">{component.reason}</p>
            </div>
          );

          return component.drillDownHref ? (
            <Link key={key} href={component.drillDownHref}>
              {content}
            </Link>
          ) : (
            <div key={key}>{content}</div>
          );
        })}
      </div>
    </section>
  );
}
