/*
 * DP-MASTER WP-27. The pure rules of a daily update: when it is due, and what a
 * draft proposes from recorded evidence. No I/O, so each rule is tested directly.
 *
 * A draft is a PROPOSAL from evidence the employee already has: contributions they
 * recorded, work they own or share, and what they said they would do next time.
 * Nothing in it is invented, every line names its source, and the employee edits it
 * freely. The same evidence is never proposed twice.
 */

export type DraftSection =
  | 'COMPLETED'
  | 'IN_PROGRESS'
  | 'NEXT'
  | 'BLOCKER'
  | 'UNPLANNED'
  | 'ACHIEVEMENT';

export type DraftItem = {
  section: DraftSection;
  text: string;
  contributionEntryId?: string;
  workItemId?: string;
};

export type DraftContribution = {
  id: string;
  category: string;
  measure: 'INTERVAL' | 'QUANTITY' | 'OCCURRENCE';
  workKind: string;
  startsAt: Date | null;
  endsAt: Date | null;
  quantity: string | null;
  unitKey: string | null;
  note: string | null;
};

export type DraftWorkItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: Date | null;
  completedAt: Date | null;
};

const LABEL: Record<string, string> = {
  PLANNED: 'Planned work',
  UNPLANNED: 'Unplanned work',
  SUPPORT: 'Support',
  MENTORING: 'Mentoring',
  KNOWLEDGE: 'Knowledge work',
  QUALITY: 'Quality check',
  SALES: 'Sales',
  ADMIN: 'Admin',
  TRAINING: 'Training',
  COVER: 'Cover duty',
  DOWNTIME: 'Downtime',
  BLOCKED: 'Blocked',
};

function describe(entry: DraftContribution): string {
  const label = LABEL[entry.category] ?? 'Work';
  let measure: string;
  if (entry.measure === 'INTERVAL' && entry.startsAt && entry.endsAt) {
    const minutes = Math.round(
      (entry.endsAt.getTime() - entry.startsAt.getTime()) / 60_000,
    );
    measure = `${minutes} min`;
  } else if (entry.measure === 'QUANTITY') {
    // The unit is kept as recorded; it is never turned into time.
    measure = `${entry.quantity ?? ''} ${entry.unitKey ?? ''}`.trim();
  } else {
    measure = 'done';
  }
  const note = entry.note?.trim();
  return `${label} (${entry.workKind.toLowerCase()}): ${measure}${note ? ` - ${note}` : ''}`;
}

/** Which section a recorded contribution belongs in. */
export function sectionForContribution(
  entry: Pick<DraftContribution, 'category'>,
): DraftSection {
  if (entry.category === 'UNPLANNED') return 'UNPLANNED';
  if (entry.category === 'DOWNTIME' || entry.category === 'BLOCKED') {
    return 'BLOCKER';
  }
  return 'COMPLETED';
}

export function buildDraftItems(input: {
  contributions: DraftContribution[];
  workItems: DraftWorkItem[];
  /** Work the previous update said would come next, still open. */
  carriedOver: DraftWorkItem[];
  /** Start and end of the day being reported, as instants. */
  dayStart: Date;
  dayEnd: Date;
  now: Date;
}): DraftItem[] {
  const items: DraftItem[] = [];
  const seen = new Set<string>();
  const push = (item: DraftItem) => {
    const key = `${item.section}:${item.contributionEntryId ?? ''}:${item.workItemId ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const entry of input.contributions) {
    push({
      section: sectionForContribution(entry),
      text: describe(entry),
      contributionEntryId: entry.id,
    });
  }

  for (const item of input.workItems) {
    if (
      item.status === 'DONE' &&
      item.completedAt &&
      item.completedAt >= input.dayStart &&
      item.completedAt < input.dayEnd
    ) {
      push({ section: 'COMPLETED', text: item.title, workItemId: item.id });
    } else if (item.status === 'IN_PROGRESS' || item.status === 'IN_REVIEW') {
      push({ section: 'IN_PROGRESS', text: item.title, workItemId: item.id });
    } else if (item.status === 'BLOCKED') {
      push({ section: 'BLOCKER', text: item.title, workItemId: item.id });
    } else if (
      item.status === 'OPEN' &&
      (item.priority === 'HIGH' ||
        item.priority === 'URGENT' ||
        (item.dueAt !== null &&
          item.dueAt.getTime() - input.now.getTime() < 2 * 86_400_000))
    ) {
      push({ section: 'NEXT', text: item.title, workItemId: item.id });
    }
  }

  // What was promised last time and is still open stays on the list.
  for (const item of input.carriedOver) {
    if (item.status === 'DONE' || item.status === 'CANCELLED') continue;
    push({ section: 'NEXT', text: item.title, workItemId: item.id });
  }
  return items;
}

/** UTC instant of `minutes` after local midnight of `date` (YYYY-MM-DD) in `timezone`. */
export function zonedInstant(
  date: string,
  minutes: number,
  timezone: string,
): Date {
  const [y, m, d] = date.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  const offset = (instant: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).formatToParts(new Date(instant));
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
    );
    return asUtc - instant;
  };
  // Two passes settle the offset across a daylight-saving change.
  let guess = naive - offset(naive);
  guess = naive - offset(guess);
  return new Date(guess);
}

/** Today's calendar date in a zone, as YYYY-MM-DD. */
export function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** ISO weekday of a YYYY-MM-DD date: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isWorkingDay(date: string, workingDays: number[]): boolean {
  return workingDays.includes(isoWeekday(date));
}

/** Was the update handed in after the deadline of the day it reports on? */
export function isLate(input: {
  forDate: string;
  deadlineMinutes: number;
  timezone: string;
  submittedAt: Date;
}): boolean {
  // The deadline is on the day reported (a day's update is due that evening).
  return (
    input.submittedAt >
    zonedInstant(input.forDate, input.deadlineMinutes, input.timezone)
  );
}

export function previousDate(date: string): string {
  const t = new Date(`${date}T00:00:00.000Z`).getTime() - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
