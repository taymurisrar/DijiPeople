import { PERMISSION_KEYS } from '../../../common/constants/permissions';
import {
  DESKTOP_ACTIVITY_SOURCE,
  DESKTOP_DEVICES_SOURCE,
  TELEMETRY_CAVEATS,
} from '../semantic/data-sources';
import { isGroupable } from '../semantic/semantic.types';
import type {
  ReportDataSource,
  ReportMetricDefinition,
} from '../semantic/semantic.types';

/**
 * Desktop activity metrics.
 *
 * **Neutral language is a hard rule here, not a preference.** These numbers
 * describe whether a machine was being interacted with. They do not describe
 * whether work was done, whether it was done well, or whether the person was
 * present — a two-hour design discussion at a whiteboard registers as two hours
 * idle. Calling any of this "productivity" attributes to the measurement a
 * meaning it cannot carry, and a metric label is the one place that attribution
 * would be hardest to argue with later. So: active, idle, away, agent uptime,
 * coverage. Every metric in this file is `direction: 'neutral'` for the same
 * reason — there is no good direction for idle time, and colouring it red would
 * be the product taking a position the data does not support.
 *
 * **`utilizationPercent` is never averaged.** The column holds a per-row ratio.
 * Averaging it across employees or days gives every employee-day equal weight
 * regardless of how long the agent ran, so one employee who ran the agent for
 * ten minutes and was active throughout pulls the number up as hard as someone
 * with a full day. The correct form divides summed active seconds by summed
 * uptime, which is the `ratio` calculation, and the field itself is marked
 * non-aggregatable so the wrong form cannot be reached.
 *
 * **These metrics carry the organization-wide read permission.** They describe
 * identifiable people's use of their own machines, and the permission that
 * governs a person looking at their own telemetry is a different one.
 */

const dimensionsOf = (source: ReportDataSource): string[] =>
  source.fields.filter(isGroupable).map((field) => field.key);

const ACTIVITY_DIMENSIONS = dimensionsOf(DESKTOP_ACTIVITY_SOURCE);
const DEVICE_DIMENSIONS = dimensionsOf(DESKTOP_DEVICES_SOURCE);

export const DESKTOP_METRICS: ReportMetricDefinition[] = [
  {
    key: 'desktop.average_active_seconds',
    label: 'Average active time per day (seconds)',
    description:
      'Mean seconds per employee-day that the agent reported the machine as being interacted with.',
    dataSourceKey: 'desktop_activity',
    valueType: 'integer',
    format: 'duration',
    calculation: { kind: 'avg', field: 'desktop_activity.active_seconds' },
    supportedDimensions: ACTIVITY_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_READ,
    sensitivity: 'RESTRICTED',
    caveats: [
      ...TELEMETRY_CAVEATS,
      'Active time measures input, not work. Reading, thinking, meetings and phone calls all register as inactive.',
      'Averaged over employee-days that produced a row. A day the agent never ran is absent from the denominator, so this reads higher than a per-calendar-day average would.',
    ],
  },
  {
    key: 'desktop.average_idle_seconds',
    label: 'Average idle time per day (seconds)',
    description:
      'Mean seconds per employee-day past the tenant idle threshold with no input registered.',
    dataSourceKey: 'desktop_activity',
    valueType: 'integer',
    format: 'duration',
    calculation: { kind: 'avg', field: 'desktop_activity.idle_seconds' },
    supportedDimensions: ACTIVITY_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_READ,
    sensitivity: 'RESTRICTED',
    caveats: [
      ...TELEMETRY_CAVEATS,
      'Idle is the absence of keyboard and mouse input past a threshold the tenant sets. It is not absence from work, and comparing two tenants means comparing two different thresholds.',
    ],
  },
  {
    key: 'desktop.average_session_seconds',
    label: 'Average agent uptime per day (seconds)',
    description:
      'Mean seconds per employee-day that the agent reported any state at all — the machine was on, signed in and the agent was running.',
    dataSourceKey: 'desktop_activity',
    valueType: 'integer',
    format: 'duration',
    calculation: { kind: 'avg', field: 'desktop_activity.logged_in_seconds' },
    supportedDimensions: ACTIVITY_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_READ,
    sensitivity: 'RESTRICTED',
    caveats: [
      ...TELEMETRY_CAVEATS,
      'Agent uptime is not working hours and must not be presented as such. A machine left on overnight accumulates uptime; a person working on a phone or a second unmanaged machine accumulates none.',
    ],
  },
  {
    key: 'desktop.active_share_of_agent_uptime',
    label: 'Active share of agent uptime',
    description:
      'Total active seconds divided by total agent uptime seconds, across the rows in scope. The denominator is the time the agent was running — not scheduled hours, and not attendance.',
    dataSourceKey: 'desktop_activity',
    valueType: 'percent',
    format: 'percent',
    calculation: {
      kind: 'ratio',
      numerator: 'desktop_activity.active_seconds',
      denominator: 'desktop_activity.logged_in_seconds',
      asPercent: true,
    },
    supportedDimensions: ACTIVITY_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_READ,
    sensitivity: 'RESTRICTED',
    caveats: [
      ...TELEMETRY_CAVEATS,
      'The denominator is agent uptime, not scheduled hours. This number is not comparable with an attendance rate and must never be charted beside one as though the two measured the same thing.',
      'A ratio of sums, deliberately. The stored per-row utilization percentage exists on the source but is not aggregatable, because averaging per-row ratios weights a ten-minute session the same as a full day.',
      'Someone who runs the agent briefly and is active throughout scores a hundred percent. Read it alongside agent uptime or it will mislead.',
    ],
  },
  {
    key: 'desktop.employees_reporting',
    label: 'Employees reporting telemetry',
    description:
      'Distinct employees with at least one agent telemetry row in the period.',
    dataSourceKey: 'desktop_activity',
    valueType: 'integer',
    calculation: {
      kind: 'count_distinct',
      field: 'desktop_activity.employee',
    },
    supportedDimensions: ACTIVITY_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_READ,
    sensitivity: 'RESTRICTED',
    caveats: [
      ...TELEMETRY_CAVEATS,
      'One row in the whole period is enough to be counted. This measures whether telemetry arrived, not how consistently.',
    ],
  },
  {
    key: 'desktop.devices_reporting',
    label: 'Devices reporting',
    description:
      'Registered devices that have connected at least once, whatever their last-seen date.',
    dataSourceKey: 'desktop_devices',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: { 'desktop_devices.last_seen_at': { isnotnull: true } },
    },
    supportedDimensions: DEVICE_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_READ,
    sensitivity: 'RESTRICTED',
    caveats: [
      'Ever connected, not recently connected. Filter on the last-seen date for a freshness view.',
      'The period on this source narrows on registration date, not on last seen, so a device enrolled before the period is excluded even if it reported yesterday.',
      'A device row survives the machine being retired, so the fleet includes hardware nobody uses.',
      'One employee may hold several devices; this is not a headcount.',
    ],
  },
  {
    key: 'desktop.devices_never_connected',
    label: 'Devices never connected',
    description:
      'Registered devices with no last-seen timestamp: enrolled, and never heard from since.',
    dataSourceKey: 'desktop_devices',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: { 'desktop_devices.last_seen_at': { isnull: true } },
    },
    supportedDimensions: DEVICE_DIMENSIONS,
    comparable: true,
    direction: 'down_is_good',
    permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_READ,
    sensitivity: 'RESTRICTED',
    caveats: [
      'A failed rollout and an abandoned enrolment look identical here.',
      'This is why the period on this source narrows on registration date: a period filtered on last-seen would exclude precisely these rows.',
    ],
  },
  {
    key: 'desktop.outdated_agent_devices',
    label: 'Devices on an outdated agent',
    description:
      'Devices whose last reported agent version is behind the tenant’s configured latest version.',
    dataSourceKey: 'desktop_devices',
    valueType: 'integer',
    calculation: {
      kind: 'derived',
      dependsOn: ['desktop_devices.agent_version'],
    },
    supportedDimensions: DEVICE_DIMENSIONS,
    comparable: true,
    direction: 'down_is_good',
    permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_READ,
    sensitivity: 'RESTRICTED',
    caveats: [
      'Requires the tenant AgentTrackingSettings latest version, which is not a column on the device and must be loaded by the query planner. Comparison is a semantic version comparison, not a string comparison — "1.10.0" sorts before "1.9.0" as text.',
      'The version is whatever the device last reported. A device that has never connected reports the version it was enrolled with.',
      'Behind the latest version is not the same as unsupported. The minimum supported version is a separate setting.',
    ],
  },
  {
    key: 'desktop.telemetry_coverage',
    label: 'Telemetry coverage',
    description:
      'Employees reporting telemetry in the period as a percentage of active headcount.',
    dataSourceKey: 'desktop_activity',
    valueType: 'percent',
    format: 'percent',
    calculation: {
      kind: 'derived',
      dependsOn: ['desktop.employees_reporting', 'workforce.active_headcount'],
    },
    supportedDimensions: ACTIVITY_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    permission: PERMISSION_KEYS.DESKTOP_ANALYTICS_READ,
    sensitivity: 'RESTRICTED',
    caveats: [
      ...TELEMETRY_CAVEATS,
      'The denominator is active headcount across the whole tenant, including people the agent was never meant for. Low coverage is usually a statement about who the agent was rolled out to, not about compliance.',
      'The two halves are scoped by different RBAC entities — telemetry by desktop analytics, headcount by employees — so a caller whose employee scope is narrower than their telemetry scope can see a percentage above one hundred.',
    ],
  },
];
