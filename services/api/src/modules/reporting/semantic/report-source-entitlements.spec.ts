import { TENANT_FEATURE_KEYS } from '../../../common/constants/tenant-features';
import { listDataSources } from './data-sources';
import {
  isReportSourceEntitled,
  REPORT_SOURCE_CORE,
  REPORT_SOURCE_ENTITLEMENTS,
} from './report-source-entitlements';

/**
 * BUG-3007 — the reporting catalog offered a full Recruitment workbench and a
 * Desktop activity surface to a Starter tenant entitled to neither. This suite
 * has two jobs: prove the attribution map has no gaps (the coverage half), and
 * prove `isReportSourceEntitled` answers correctly for the plans this bug was
 * measured against (the behaviour half) — mirroring
 * `settings-entitlements.spec.ts`, which did both for the same defect on the
 * settings information architecture (BUG-2958).
 */
describe('REPORT_SOURCE_ENTITLEMENTS coverage', () => {
  it('attributes every registered data source', () => {
    const sourceKeys = listDataSources().map((source) => source.key);
    const missing = sourceKeys.filter(
      (key) => REPORT_SOURCE_ENTITLEMENTS[key] === undefined,
    );

    expect(missing).toEqual([]);
  });

  it('has no attribution for a source that no longer exists', () => {
    const sourceKeys = new Set(listDataSources().map((source) => source.key));
    const stale = Object.keys(REPORT_SOURCE_ENTITLEMENTS).filter(
      (key) => !sourceKeys.has(key),
    );

    expect(stale).toEqual([]);
  });
});

describe('isReportSourceEntitled', () => {
  // The seven keys plans.catalog.ts lists for Starter.
  const STARTER_KEYS = [
    'employees',
    'organization',
    'leave',
    'attendance',
    'documents',
    'notifications',
    'branding',
  ];

  const ENTERPRISE_KEYS = Object.values(TENANT_FEATURE_KEYS);

  it('grants Starter the sources its plan actually sells', () => {
    expect(isReportSourceEntitled('workforce', STARTER_KEYS)).toBe(true);
    expect(isReportSourceEntitled('workforce_history', STARTER_KEYS)).toBe(
      true,
    );
    expect(isReportSourceEntitled('attendance', STARTER_KEYS)).toBe(true);
    expect(isReportSourceEntitled('leave_requests', STARTER_KEYS)).toBe(true);
    expect(isReportSourceEntitled('leave_consumption', STARTER_KEYS)).toBe(
      true,
    );
    expect(isReportSourceEntitled('leave_balances', STARTER_KEYS)).toBe(true);
  });

  it('refuses Starter the Recruitment and Desktop sources — the reported leak', () => {
    expect(isReportSourceEntitled('recruitment_openings', STARTER_KEYS)).toBe(
      false,
    );
    expect(isReportSourceEntitled('recruitment_candidates', STARTER_KEYS)).toBe(
      false,
    );
    expect(
      isReportSourceEntitled('recruitment_applications', STARTER_KEYS),
    ).toBe(false);
    expect(
      isReportSourceEntitled('recruitment_stage_transitions', STARTER_KEYS),
    ).toBe(false);
    expect(isReportSourceEntitled('desktop_activity', STARTER_KEYS)).toBe(
      false,
    );
    expect(isReportSourceEntitled('desktop_devices', STARTER_KEYS)).toBe(false);
  });

  it('grants every source on Enterprise, which holds every catalog key', () => {
    for (const source of listDataSources()) {
      expect(isReportSourceEntitled(source.key, ENTERPRISE_KEYS)).toBe(true);
    }
  });

  it('denies every source on an empty entitlement set', () => {
    for (const source of listDataSources()) {
      expect(isReportSourceEntitled(source.key, [])).toBe(false);
    }
  });

  it('denies an unattributed source even when the caller has every key', () => {
    expect(isReportSourceEntitled('not-a-real-source', ENTERPRISE_KEYS)).toBe(
      false,
    );
  });

  it('has no CORE source today, but the type still allows one', () => {
    const coreEntries = Object.values(REPORT_SOURCE_ENTITLEMENTS).filter(
      (entitlement) => entitlement === REPORT_SOURCE_CORE,
    );
    expect(coreEntries).toEqual([]);
  });
});
