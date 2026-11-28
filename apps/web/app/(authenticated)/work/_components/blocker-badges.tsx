import { StatusPill } from "@/app/components/ui/status-pill";
import {
  blockerStatusLabel,
  blockerStatusTone,
  categoryLabel,
  causeLabel,
  causeTone,
  escalationLabel,
  formatBlockedDuration,
  isOpenBlocker,
  type WorkBlocker,
} from "../_lib/blockers";

/**
 * A blocker's facts as text pills: status, category, cause, overdue and
 * escalation. Nothing is carried by colour alone, and an undetermined cause
 * reads as "Cause not determined", never as a blank.
 */
export function BlockerBadges({ blocker }: { blocker: WorkBlocker }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill tone={blockerStatusTone(blocker.status)}>
        {blockerStatusLabel(blocker.status)}
      </StatusPill>
      <StatusPill tone="neutral">{categoryLabel(blocker.category)}</StatusPill>
      <StatusPill tone={causeTone(blocker.cause)}>
        {causeLabel(blocker.cause)}
      </StatusPill>
      {blocker.overdue ? <StatusPill tone="danger">Overdue</StatusPill> : null}
      {blocker.escalationLevel > 0 ? (
        <StatusPill tone="warning">
          {escalationLabel(blocker.escalationLevel)}
        </StatusPill>
      ) : null}
      {isOpenBlocker(blocker) ? (
        <span className="text-xs text-muted">
          {`Open for ${formatBlockedDuration(blocker.openMinutes)}`}
        </span>
      ) : null}
    </div>
  );
}
