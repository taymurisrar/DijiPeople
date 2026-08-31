import type {
  ReportDataSource,
  ReportDataSourceRegistry,
  ReportFieldDefinition,
} from '../semantic.types';
import { ATTENDANCE_SOURCE } from './attendance.source';
import { DESKTOP_ACTIVITY_SOURCE } from './desktop-activity.source';
export { TELEMETRY_CAVEATS } from './desktop-activity.source';
import { DESKTOP_DEVICES_SOURCE } from './desktop-device.source';
import {
  LEAVE_BALANCES_SOURCE,
  LEAVE_CONSUMPTION_SOURCE,
  LEAVE_REQUESTS_SOURCE,
} from './leave.source';
import {
  RECRUITMENT_APPLICATIONS_SOURCE,
  RECRUITMENT_CANDIDATES_SOURCE,
  RECRUITMENT_OPENINGS_SOURCE,
  RECRUITMENT_STAGE_TRANSITIONS_SOURCE,
} from './recruitment.source';
import { WORKFORCE_HISTORY_SOURCE } from './workforce-history.source';
import { WORKFORCE_SOURCE } from './workforce.source';

/**
 * The data source registry — the allow-list the query engine resolves against.
 *
 * A key that is not in this map is not a data source, a field key that is not
 * in a source's `fields` is not a field, and neither can be reached by anything
 * a client sends. That is the security property the whole semantic layer exists
 * for, so this file deliberately has no dynamic registration, no merging of
 * tenant-supplied entries and no lookup that falls back to the request.
 *
 * Ordering is presentation order for the source picker: the sources most people
 * report on first, the operational ones last.
 */
const ALL_SOURCES: readonly ReportDataSource[] = [
  WORKFORCE_SOURCE,
  WORKFORCE_HISTORY_SOURCE,
  ATTENDANCE_SOURCE,
  LEAVE_REQUESTS_SOURCE,
  LEAVE_CONSUMPTION_SOURCE,
  LEAVE_BALANCES_SOURCE,
  RECRUITMENT_OPENINGS_SOURCE,
  RECRUITMENT_CANDIDATES_SOURCE,
  RECRUITMENT_APPLICATIONS_SOURCE,
  RECRUITMENT_STAGE_TRANSITIONS_SOURCE,
  DESKTOP_ACTIVITY_SOURCE,
  DESKTOP_DEVICES_SOURCE,
];

function buildRegistry(
  sources: readonly ReportDataSource[],
): ReportDataSourceRegistry {
  const registry = new Map<string, ReportDataSource>();
  for (const source of sources) {
    if (registry.has(source.key)) {
      // Thrown at module load, so a duplicate key cannot reach a request. Two
      // sources sharing a key would silently shadow one another and the loser
      // would simply stop existing.
      throw new Error(
        `Duplicate report data source key: ${source.key}. Data source keys must be unique across the registry.`,
      );
    }
    registry.set(source.key, source);
  }
  return registry;
}

export const REPORT_DATA_SOURCES: ReportDataSourceRegistry =
  buildRegistry(ALL_SOURCES);

export function getDataSource(key: string): ReportDataSource | undefined {
  return REPORT_DATA_SOURCES.get(key);
}

export function listDataSources(): ReportDataSource[] {
  return [...REPORT_DATA_SOURCES.values()];
}

/** Resolve a `<source>.<field>` key without the caller splitting it by hand. */
export function getField(fieldKey: string): ReportFieldDefinition | undefined {
  const separator = fieldKey.indexOf('.');
  if (separator <= 0) return undefined;
  const source = REPORT_DATA_SOURCES.get(fieldKey.slice(0, separator));
  return source?.fields.find((field) => field.key === fieldKey);
}

export {
  ATTENDANCE_SOURCE,
  DESKTOP_ACTIVITY_SOURCE,
  DESKTOP_DEVICES_SOURCE,
  LEAVE_BALANCES_SOURCE,
  LEAVE_CONSUMPTION_SOURCE,
  LEAVE_REQUESTS_SOURCE,
  RECRUITMENT_APPLICATIONS_SOURCE,
  RECRUITMENT_CANDIDATES_SOURCE,
  RECRUITMENT_OPENINGS_SOURCE,
  RECRUITMENT_STAGE_TRANSITIONS_SOURCE,
  WORKFORCE_HISTORY_SOURCE,
  WORKFORCE_SOURCE,
};
