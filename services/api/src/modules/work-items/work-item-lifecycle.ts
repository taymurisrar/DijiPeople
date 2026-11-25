/*
 * DP-MASTER WP-02.S1 (ADR-0030). The pure rules of the work item lifecycle: which
 * status changes are allowed, and whether a new dependency edge would close a
 * cycle. No I/O, so every rule is unit-tested directly.
 */
export const WORK_ITEM_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'DONE',
  'CANCELLED',
] as const;
export type WorkItemStatusValue = (typeof WORK_ITEM_STATUSES)[number];

/** An explicit table, not free-form status writes. Reopening is a named move. */
export const WORK_ITEM_TRANSITIONS: Record<
  WorkItemStatusValue,
  readonly WorkItemStatusValue[]
> = {
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['OPEN', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE'],
  DONE: ['IN_PROGRESS'],
  CANCELLED: ['OPEN'],
};

export const TERMINAL_STATUSES: readonly WorkItemStatusValue[] = [
  'DONE',
  'CANCELLED',
];

export function canTransition(
  from: WorkItemStatusValue,
  to: WorkItemStatusValue,
): boolean {
  return WORK_ITEM_TRANSITIONS[from].includes(to);
}

/**
 * Would adding "item depends on prerequisite" create a cycle? `edges` maps an
 * item id to the ids it already depends on. A cycle exists when the prerequisite
 * can already reach the item by following dependencies, or when they are equal.
 */
export function wouldCreateCycle(
  edges: ReadonlyMap<string, readonly string[]>,
  itemId: string,
  prerequisiteId: string,
): boolean {
  if (itemId === prerequisiteId) return true;
  const seen = new Set<string>();
  const stack = [prerequisiteId];
  while (stack.length) {
    const current = stack.pop() as string;
    if (current === itemId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of edges.get(current) ?? []) stack.push(next);
  }
  return false;
}

/**
 * Sums each person's estimate and actual once. The one-row-per-person rule is the
 * database's; this only totals what it holds, so shared work is never counted
 * twice and a missing value is not read as zero.
 */
export function totalEffort(
  contributors: readonly {
    estimateMinutes: number | null;
    actualMinutes: number | null;
  }[],
) {
  const sum = (pick: 'estimateMinutes' | 'actualMinutes') => {
    const values = contributors
      .map((c) => c[pick])
      .filter((v): v is number => typeof v === 'number');
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  return {
    estimateMinutes: sum('estimateMinutes'),
    actualMinutes: sum('actualMinutes'),
    contributors: contributors.length,
  };
}

export const MAX_SUBTASK_DEPTH = 5;

export type SlaState = 'NONE' | 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET';

/**
 * Where an item stands against a promise made when it was queued. A promise is a
 * due time stamped on the item, so editing a queue's SLA later never rewrites
 * what an old item was promised. AT_RISK is the last quarter of the window.
 */
export function slaState(input: {
  dueAt: Date | null;
  startedAt: Date;
  /** When the promise was met (first response, or completion); null if not yet. */
  metAt: Date | null;
  now: Date;
}): SlaState {
  if (!input.dueAt) return 'NONE';
  if (input.metAt) return input.metAt <= input.dueAt ? 'MET' : 'BREACHED';
  if (input.now > input.dueAt) return 'BREACHED';
  const window = input.dueAt.getTime() - input.startedAt.getTime();
  const left = input.dueAt.getTime() - input.now.getTime();
  return window > 0 && left <= window / 4 ? 'AT_RISK' : 'ON_TRACK';
}
