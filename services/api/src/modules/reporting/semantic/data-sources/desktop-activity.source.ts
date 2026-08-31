import { ENTITY_KEYS } from '../../../../common/constants/rbac-matrix';
import type {
  ReportDataSource,
  ReportFieldDefinition,
} from '../semantic.types';
import { employeeDimensionFields } from './workforce.source';

/**
 * Desktop activity — what the attendance agent reported, and nothing more.
 *
 * **Language.** Every label and description here is neutral. The agent observes
 * whether a machine was being interacted with; it does not observe whether work
 * was being done, and a catalog that calls idle time "unproductive" has made a
 * judgement the data cannot support. "Active", "idle", "away" and "agent
 * uptime" are the vocabulary. "Productive", "productivity" and "efficiency" are
 * not, and `DailyProductivitySummary.utilizationPercent` — a column named
 * before that line was drawn — is surfaced as **active share of agent uptime**,
 * with its denominator stated, because the number is a share of the time the
 * agent was running and not a share of the working day.
 *
 * **Scope of what exists.** `DailyProductivitySummary` holds four second
 * counters, a percentage derived from two of them, a date and a calculation
 * timestamp. That is the entire aggregate. `ActivityEvent` does carry
 * `activeApp`, `activeAppPath`, `windowTitle` and `browserTabTitle`, but there
 * is no aggregate over them, no application category table, no per-application
 * duration and no browser-domain rollup anywhere in this schema. No field or
 * metric in this file is built on any of that: an application-usage report
 * would have to invent both the aggregation and the categories, and inventing
 * surveillance output is worse than not shipping the report.
 *
 * **Four things make these numbers weaker than they look**, and all four are
 * on the source as caveats rather than in a design document:
 *
 *   1. Rows written before the BUG-0036 fix are inflated. The agent re-sent
 *      whole batches on failure and the server incremented the running totals
 *      unconditionally, so a replayed batch permanently added time that was
 *      never worked. `ActivityEvent.dedupeKey` is null on exactly those rows;
 *      the totals they inflated were never corrected.
 *   2. The day boundary is **UTC**. `upsertDailySummary` buckets on
 *      `startOfUtcDay(occurredAt)`, so a tenant east or west of UTC has its
 *      evening or its early morning attributed to the neighbouring day.
 *   3. The seconds are **nominal, not measured**. Each heartbeat credits a
 *      whole heartbeat interval to whichever state it reported; nothing
 *      measures the interval between two heartbeats. A missed heartbeat is
 *      simply absent rather than being counted as away.
 *   4. The window is bounded by the tenant's
 *      `AgentTrackingSettings.historyRetentionDays`, 90 by default. Older rows
 *      are deleted, so a year-long trend is not merely sparse — it is empty
 *      before the retention edge, and looks like a workforce that stopped
 *      working rather than data that was swept.
 *
 * **Units are seconds.** Every counter on this model is stored in seconds and
 * is published in seconds. The semantic contract's only duration type is
 * `duration_minutes`, so these fields are typed `integer` with a `duration`
 * format and carry their unit in the label. Converting silently in a metric is
 * exactly how a chart comes to be sixty times wrong.
 */

const secondsField = (args: {
  name: string;
  label: string;
  description: string;
  column: string;
}): ReportFieldDefinition => ({
  key: `desktop_activity.${args.name}`,
  label: args.label,
  description: args.description,
  type: 'integer',
  path: args.column,
  format: 'duration',
  reportable: true,
  filterable: true,
  sortable: true,
  aggregatable: true,
  supportedAggregations: ['sum', 'avg', 'min', 'max'],
  sensitivity: 'INTERNAL',
});

/**
 * The five caveats that qualify every telemetry number.
 *
 * Exported, and imported by `desktop.metrics.ts` rather than restated there.
 * Both are needed: a metric carries its own copy so the note appears beside the
 * tile, and the source carries them so they appear in the page panel. When the
 * two were worded separately the panel showed each one twice — the union is
 * deduplicated by exact string, and "are the ones whose" and "are those whose"
 * are not the same string. One authoritative wording is what makes the
 * deduplication work.
 */
export const TELEMETRY_CAVEATS = [
  'Rows written before the BUG-0036 deduplication fix are inflated: a re-sent heartbeat batch permanently added time that was never worked, and those totals were never corrected. The contaminated rows are the ones whose underlying ActivityEvent rows have a null dedupeKey.',
  'The day boundary is UTC, not the tenant timezone. For a tenant several hours from UTC, part of each evening or early morning lands on the neighbouring day.',
  'Seconds are nominal, not measured: each heartbeat credits a whole heartbeat interval to the state it reported. A missed heartbeat is absent rather than counted as away, so uptime understates rather than overstates gaps.',
  'History is bounded by the tenant AgentTrackingSettings retention window, 90 days by default. Beyond it the rows are deleted, and an empty period means swept data rather than an inactive workforce.',
  'Telemetry exists only for employees who have the desktop agent installed and signed in. An employee with no rows is not an employee who did nothing.',
];

export const DESKTOP_ACTIVITY_SOURCE: ReportDataSource = {
  key: 'desktop_activity',
  label: 'Desktop activity',
  description:
    'Daily agent telemetry. One row per employee per UTC day, holding the seconds the agent reported in each state.',
  prismaModel: 'dailyProductivitySummary',
  rbacEntityKey: ENTITY_KEYS.DESKTOP_ANALYTICS,
  scope: {
    // The summary carries userId, so a SELF-scoped caller resolves to their own
    // rows — which is exactly what `desktop-analytics.read.own` is for.
    organizationIdField: null,
    userIdField: 'userId',
  },
  // This model carries tenantId and employeeId and nothing else the access
  // helpers can narrow on. Scoping it on its own columns has only two
  // possible outcomes and both are wrong: the whole tenant, or nothing at
  // all. Scoping through the employee relation gives a business-unit reader
  // exactly the rows of the employees they can already see.
  scopeRelationPath: ['employee'],
  scopeRelationOptions: {
    organizationIdField: null,
    userIdField: 'userId',
  },
  defaultDateField: 'date',
  recordIdField: 'id',
  caveats: [
    ...TELEMETRY_CAVEATS,
    'Active share is a share of the time the agent was running, not of scheduled hours. It is not comparable to an attendance rate and must never be presented beside one as though it were.',
    'Application names, window titles and browser tabs are not reported on. No aggregate over them exists in this system.',
  ],
  fields: [
    {
      key: 'desktop_activity.id',
      label: 'Summary row id',
      type: 'string',
      path: 'id',
      reportable: true,
      filterable: true,
      hidden: true,
    },
    {
      key: 'desktop_activity.date',
      label: 'Date (UTC)',
      description:
        'The UTC day this summary covers. The default period field for this source.',
      type: 'date',
      path: 'date',
      format: 'date',
      reportable: true,
      filterable: true,
      sortable: true,
      groupable: true,
      groupByField: 'date',
    },
    secondsField({
      name: 'logged_in_seconds',
      label: 'Agent uptime (seconds)',
      description:
        'Seconds the agent reported any state at all. The denominator of active share — this is agent uptime, not scheduled working time.',
      column: 'loggedInSeconds',
    }),
    secondsField({
      name: 'active_seconds',
      label: 'Active time (seconds)',
      description:
        'Seconds the agent reported the machine as being interacted with.',
      column: 'activeSeconds',
    }),
    secondsField({
      name: 'idle_seconds',
      label: 'Idle time (seconds)',
      description:
        'Seconds past the tenant idle threshold with no input. Time spent reading, in a meeting or on a phone call registers here.',
      column: 'idleSeconds',
    }),
    secondsField({
      name: 'away_seconds',
      label: 'Away time (seconds)',
      description: 'Seconds past the tenant away threshold with no input.',
      column: 'awaySeconds',
    }),
    {
      key: 'desktop_activity.utilization_percent',
      label: 'Active share of agent uptime (stored)',
      description:
        'The stored per-row percentage: active seconds over agent uptime for this one employee-day. Deliberately NOT aggregatable — averaging a per-row ratio across employees or days is a ratio of ratios and gives the wrong answer. Use the "Active share of agent uptime" metric, which divides the summed numerator by the summed denominator.',
      type: 'percent',
      path: 'utilizationPercent',
      format: 'percent',
      reportable: true,
      filterable: true,
      sortable: true,
      aggregatable: false,
      sensitivity: 'INTERNAL',
    },
    {
      key: 'desktop_activity.last_calculated_at',
      label: 'Last calculated at',
      description: 'When the agent last updated this row.',
      type: 'datetime',
      path: 'lastCalculatedAt',
      format: 'datetime',
      reportable: true,
      filterable: true,
      sortable: true,
    },
    ...employeeDimensionFields({
      sourceKey: 'desktop_activity',
      employeeRelationPath: ['employee'],
      employeeIdField: 'employeeId',
    }),
  ],
};
