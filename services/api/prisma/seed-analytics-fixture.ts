/*
 * Analytics fixture generator — a dataset large and varied enough to develop,
 * unit-test and demonstrate the Reports & Analytics platform against.
 *
 * WHY THIS EXISTS
 * ---------------
 * `seed-demo` produces 15 employees, one attendance entry, one leave request,
 * no candidates and no desktop telemetry. Every analytics surface built on it
 * renders empty or as a single point, and no metric assertion can carry a
 * meaningful expected value — a trend with one sample is not a trend, and a
 * funnel with no stage transitions is not a funnel. This generator produces the
 * shape the reporting engine is actually specified against: two tenants, a real
 * organisational tree, employees spread across every employment status with
 * joiners and leavers throughout the window, per-day `AttendanceDay` rows,
 * leave across all four statuses, a recruitment pipeline with stage-transition
 * history, and desktop telemetry including the failure modes the real system
 * produces.
 *
 * DETERMINISM
 * -----------
 * Nothing here calls `Math.random()`. Every value is derived by hashing a
 * stable key (`FIXTURE_SEED` + a description of the thing being generated)
 * rather than by drawing from a sequential PRNG. That distinction matters: a
 * sequential PRNG makes every value depend on how many values were drawn before
 * it, so reordering a loop — or generating one extra employee — silently
 * changes every subsequent row. Hash-derived values depend only on their own
 * key, so the dataset is stable under refactoring, and re-running the generator
 * cannot produce a second, different copy of the same conceptual row.
 *
 * Row ids are derived the same way, which is what makes the generator
 * restartable: an interrupted run is resumed rather than duplicated.
 *
 * The one thing that is NOT fixed is the window. `--to` defaults to today, so
 * "the last 400 days" moves. A spec that wants pinned numbers must pass
 * `--from` and `--to` explicitly; the summary always prints the window it used.
 *
 * SAFETY
 * ------
 * This writes tens of thousands of rows and is for development and test
 * databases only. Two independent checks must pass before a single row is
 * written, and both run before any write transaction is opened:
 *
 *   1. `scripts/assert-test-database.mjs` — the repository's guard, spawned
 *      rather than reimplemented so this file cannot drift away from the policy
 *      migrations and DB-backed tests are held to.
 *   2. An inline re-check of the same three essentials (local host, no
 *      dangerous name, a positive test marker). Deliberate duplication: the
 *      guard is the authority, but deleting or moving that script must not
 *      quietly turn this generator into something that will run against
 *      `dijipeople`.
 *
 * An explicit `--confirm` flag is required on top of both.
 *
 * USAGE
 * -----
 *   DATABASE_URL=postgresql://…/dijipeople_<scope>_test \
 *     npm --workspace api run seed:analytics-fixture -- --confirm
 *
 *   --confirm                required; refuses to run without it
 *   --tenant <slug>          main fixture tenant   (default: analytics-fixture)
 *   --secondary <slug>       isolation-probe tenant (default: <tenant>-secondary)
 *   --from <YYYY-MM-DD>      window start (default: <to> minus 400 days)
 *   --to <YYYY-MM-DD>        window end   (default: today, UTC)
 *   --help
 *
 * The second tenant exists so cross-tenant isolation tests have something to
 * prove against: its rows must never appear in the main tenant's reports.
 */

import { config as loadEnv } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AttendanceDayStatus,
  EmployeeEmploymentStatus,
  EmployeeGender,
  EmployeeRecordType,
  EmployeeType,
  EmployeeWorkMode,
  JobOpeningStatus,
  LeaveRequestStatus,
  Prisma,
  RecruitmentStage,
  UserStatus,
  WorkSessionStatus,
} from '@prisma/client';
import { ensureIdentityForEmail } from '../src/modules/users/identity.service';
import { createPrismaClient } from './create-prisma-client';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

// ---------------------------------------------------------------- determinism

/**
 * Bump this only when the dataset is intended to change. Every id and every
 * generated value hangs off it, so changing it produces an entirely new
 * dataset alongside the old one rather than updating it.
 */
const FIXTURE_SEED = 'dijipeople-analytics-fixture-v1';

type KeyPart = string | number;

function digestOf(prefix: string, parts: KeyPart[]): Buffer {
  return createHash('sha256')
    .update(`${FIXTURE_SEED}|${prefix}|${parts.join('|')}`)
    .digest();
}

/** A stable float in [0, 1) for this key. */
function unit(...parts: KeyPart[]): number {
  // 48 bits is well inside the exactly-representable integer range.
  return digestOf('unit', parts).readUIntBE(0, 6) / 2 ** 48;
}

/** A stable integer in [min, max] for this key. */
function intBetween(min: number, max: number, ...parts: KeyPart[]): number {
  return min + Math.floor(unit(...parts) * (max - min + 1));
}

/** A stable element of `values` for this key. */
function pick<T>(values: readonly T[], ...parts: KeyPart[]): T {
  return values[Math.floor(unit(...parts) * values.length)];
}

/**
 * A stable element of `values` honouring the given weights.
 *
 * Weighted rather than uniform because a uniform employment-type mix is not a
 * realistic one, and a chart of it teaches nothing.
 */
function pickWeighted<T>(
  values: readonly { value: T; weight: number }[],
  ...parts: KeyPart[]
): T {
  const total = values.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = unit(...parts) * total;
  for (const entry of values) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.value;
  }
  return values[values.length - 1].value;
}

/** True with the given probability, stably for this key. */
function chance(probability: number, ...parts: KeyPart[]): boolean {
  return unit(...parts) < probability;
}

/**
 * A deterministic UUID-shaped id.
 *
 * Shaped like a v5 UUID (version nibble and variant bits set) so it is
 * indistinguishable from the `@default(uuid())` values every other row carries.
 * The derivation is a plain SHA-1 of the seed and key, not RFC 4122 v5 — the
 * format is what matters here, not interoperability with another generator.
 */
function fixtureId(...parts: KeyPart[]): string {
  const hex = createHash('sha1')
    .update(`${FIXTURE_SEED}|id|${parts.join('|')}`)
    .digest('hex');
  const variant = '89ab'[parseInt(hex[16], 16) % 4];
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

// ---------------------------------------------------------------------- dates

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function atTime(day: Date, minutesFromMidnight: number): Date {
  return new Date(day.getTime() + minutesFromMidnight * 60 * 1000);
}

/**
 * The tenant weekend default in this product is Friday/Saturday, not
 * Saturday/Sunday. Getting this wrong makes every attendance denominator wrong
 * by two sevenths, which is exactly the class of error the fixture exists to
 * expose rather than to reproduce.
 */
function isWeekendDay(value: Date): boolean {
  const day = value.getUTCDay();
  return day === 5 || day === 6;
}

/**
 * Fixed public holidays, repeated each year in the window.
 *
 * Real Hijri-calendar holidays move; these do not, because a fixture whose
 * holiday set depends on an ephemeris is not deterministic and cannot back an
 * exact expected value.
 */
const HOLIDAY_MONTH_DAYS: readonly [number, number][] = [
  [1, 1],
  [2, 22],
  [4, 10],
  [4, 11],
  [6, 16],
  [6, 17],
  [9, 23],
  [12, 18],
];

function buildHolidaySet(from: Date, to: Date): Set<string> {
  const holidays = new Set<string>();
  for (
    let year = from.getUTCFullYear();
    year <= to.getUTCFullYear();
    year += 1
  ) {
    for (const [month, day] of HOLIDAY_MONTH_DAYS) {
      holidays.add(isoDay(new Date(Date.UTC(year, month - 1, day))));
    }
  }
  return holidays;
}

// ------------------------------------------------------------------------ CLI

interface CliOptions {
  confirm: boolean;
  tenantSlug: string;
  secondarySlug: string;
  from: Date;
  to: Date;
}

const USAGE = `
seed-analytics-fixture — deterministic analytics dataset for a throwaway database

  --confirm            required
  --tenant <slug>      default: analytics-fixture
  --secondary <slug>   default: <tenant>-secondary
  --from <YYYY-MM-DD>  default: <to> minus 400 days
  --to <YYYY-MM-DD>    default: today (UTC)
  --help
`.trim();

function parseCli(argv: string[]): CliOptions {
  const flagValue = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    if (index === -1) return undefined;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${name} requires a value.`);
    }
    return value;
  };

  const parseDay = (name: string, raw: string): Date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new Error(`${name} must be YYYY-MM-DD, received "${raw}".`);
    }
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${name} is not a real date: "${raw}".`);
    }
    return parsed;
  };

  const tenantSlug = (flagValue('--tenant') ?? 'analytics-fixture')
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(tenantSlug)) {
    throw new Error(`--tenant "${tenantSlug}" is not a usable slug.`);
  }
  /*
   * A dedicated fixture tenant, never `dijipeople-demo`. The demo tenant is the
   * one a person logs into to look at the product; filling it with 240
   * synthetic employees and 40,000 attendance rows would destroy that.
   */
  if (tenantSlug === 'dijipeople-demo') {
    throw new Error(
      'Refusing to target the demo tenant. The analytics fixture uses its own tenant.',
    );
  }

  const secondarySlug = (flagValue('--secondary') ?? `${tenantSlug}-secondary`)
    .trim()
    .toLowerCase();
  if (secondarySlug === tenantSlug) {
    throw new Error('--secondary must differ from --tenant.');
  }

  const toRaw = flagValue('--to');
  const to = toRaw ? parseDay('--to', toRaw) : utcDay(new Date());
  const fromRaw = flagValue('--from');
  const from = fromRaw ? parseDay('--from', fromRaw) : addDays(to, -400);
  if (from >= to) throw new Error('--from must be before --to.');
  if (daysBetween(from, to) > 2000) {
    throw new Error('Window is longer than 2000 days; refusing.');
  }

  return {
    confirm: argv.includes('--confirm'),
    tenantSlug,
    secondarySlug,
    from,
    to,
  };
}

// --------------------------------------------------------------------- safety

/**
 * Refuse anything that is not demonstrably a throwaway database.
 *
 * Runs to completion before the first write. Returns nothing; it either passes
 * or exits the process.
 */
function assertDisposableDatabase(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    console.error('DATABASE_URL is not set. Refusing to continue.');
    process.exit(1);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    console.error('DATABASE_URL is not a parseable URL. Refusing to continue.');
    process.exit(1);
  }

  const host = url.hostname.toLowerCase();
  const database = url.pathname.replace(/^\//, '') || '(none)';
  // Host and database only — never the credential.
  const label = `${host}:${url.port || '5432'}/${database}`;

  /*
   * Check 1: the repository guard, spawned rather than reimplemented. It is the
   * authority on what "disposable" means, and it is the same check that stands
   * in front of `migrate deploy` and the DB-backed suites in CI.
   */
  const guard = resolve(__dirname, '../../../scripts/assert-test-database.mjs');
  if (!existsSync(guard)) {
    console.error(
      `REFUSED — the database guard is missing at ${guard}.\n` +
        'This generator will not write without it.',
    );
    process.exit(1);
  }
  const verdict = spawnSync(process.execPath, [guard], {
    stdio: 'inherit',
    env: process.env,
  });
  if (verdict.status !== 0) {
    console.error(
      `REFUSED — ${label} did not pass scripts/assert-test-database.mjs.`,
    );
    process.exit(1);
  }

  /*
   * Check 2: the same three essentials, inline.
   *
   * Deliberately duplicated. The guard above is authoritative, but a generator
   * that writes 40,000 rows must not become safe-to-run against `dijipeople`
   * merely because somebody moved a script. If this ever disagrees with the
   * guard, the guard is right and this needs updating — it is a floor, not a
   * second opinion.
   */
  const failures: string[] = [];
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
  if (!localHosts.has(host)) {
    failures.push(`host "${host}" is not local`);
  }
  const lowerName = database.toLowerCase();
  for (const dangerous of [
    'prod',
    'production',
    'staging',
    'stage',
    'live',
    'main',
  ]) {
    if (new RegExp(`(^|[^a-z])${dangerous}([^a-z]|$)`).test(lowerName)) {
      failures.push(`database name contains "${dangerous}"`);
    }
  }
  const markers = ['test', 'ci', 'ephemeral', 'scratch', 'tmp'];
  if (!markers.some((marker) => lowerName.includes(marker))) {
    failures.push(
      `database name carries no test marker (${markers.join(', ')})`,
    );
  }
  if (failures.length) {
    console.error(`REFUSED — ${label} is not a safe fixture target:`);
    for (const failure of failures) console.error(`  x ${failure}`);
    process.exit(1);
  }

  return label;
}

// ----------------------------------------------------------- structural specs

interface OrganizationSpec {
  code: string;
  name: string;
  parentCode: string | null;
}

interface BusinessUnitSpec {
  code: string;
  name: string;
  organizationCode: string;
  parentCode: string | null;
}

interface DepartmentSpec {
  code: string;
  name: string;
  businessUnitCode: string;
}

interface TeamSpec {
  key: string;
  name: string;
  departmentCode: string;
}

interface LocationSpec {
  code: string;
  name: string;
  city: string;
  state: string;
  country: string;
  timezone: string;
}

const ORGANIZATION_SPECS: readonly OrganizationSpec[] = [
  { code: 'GRP', name: 'Fixture Group Holding', parentCode: null },
  { code: 'SVC', name: 'Fixture Field Services', parentCode: 'GRP' },
];

const BUSINESS_UNIT_SPECS: readonly BusinessUnitSpec[] = [
  {
    code: 'CORP',
    name: 'Corporate',
    organizationCode: 'GRP',
    parentCode: null,
  },
  // The parent/child pair. BusinessUnit is a self-referencing tree and a
  // fixture with a flat one cannot exercise rollup or hierarchy filters.
  {
    code: 'TECH',
    name: 'Technology',
    organizationCode: 'GRP',
    parentCode: 'CORP',
  },
  {
    code: 'COMM',
    name: 'Commercial',
    organizationCode: 'GRP',
    parentCode: 'CORP',
  },
  {
    code: 'FIELD',
    name: 'Field Operations',
    organizationCode: 'SVC',
    parentCode: null,
  },
];

const DEPARTMENT_SPECS: readonly DepartmentSpec[] = [
  { code: 'ENG', name: 'Engineering', businessUnitCode: 'TECH' },
  { code: 'PROD', name: 'Product', businessUnitCode: 'TECH' },
  { code: 'DATA', name: 'Data & Analytics', businessUnitCode: 'TECH' },
  { code: 'SALES', name: 'Sales', businessUnitCode: 'COMM' },
  { code: 'MKTG', name: 'Marketing', businessUnitCode: 'COMM' },
  { code: 'FIN', name: 'Finance', businessUnitCode: 'CORP' },
  { code: 'PEOPLE', name: 'People & Culture', businessUnitCode: 'CORP' },
  { code: 'OPS', name: 'Operations', businessUnitCode: 'FIELD' },
];

const TEAM_SPECS: readonly TeamSpec[] = [
  { key: 'platform-eng', name: 'Platform Engineering', departmentCode: 'ENG' },
  { key: 'web-eng', name: 'Web Engineering', departmentCode: 'ENG' },
  { key: 'mobile-eng', name: 'Mobile Engineering', departmentCode: 'ENG' },
  { key: 'product-mgmt', name: 'Product Management', departmentCode: 'PROD' },
  { key: 'design', name: 'Product Design', departmentCode: 'PROD' },
  { key: 'data-eng', name: 'Data Engineering', departmentCode: 'DATA' },
  { key: 'analytics', name: 'Business Analytics', departmentCode: 'DATA' },
  {
    key: 'enterprise-sales',
    name: 'Enterprise Sales',
    departmentCode: 'SALES',
  },
  { key: 'smb-sales', name: 'SMB Sales', departmentCode: 'SALES' },
  { key: 'growth', name: 'Growth Marketing', departmentCode: 'MKTG' },
  { key: 'controlling', name: 'Financial Control', departmentCode: 'FIN' },
  { key: 'field-ops', name: 'Field Operations Crew', departmentCode: 'OPS' },
];

const LOCATION_SPECS: readonly LocationSpec[] = [
  {
    code: 'RUH',
    name: 'Riyadh Head Office',
    city: 'Riyadh',
    state: 'Riyadh',
    country: 'Saudi Arabia',
    timezone: 'Asia/Riyadh',
  },
  {
    code: 'JED',
    name: 'Jeddah Office',
    city: 'Jeddah',
    state: 'Makkah',
    country: 'Saudi Arabia',
    timezone: 'Asia/Riyadh',
  },
  {
    code: 'DOH',
    name: 'Doha Office',
    city: 'Doha',
    state: 'Ad Dawhah',
    country: 'Qatar',
    timezone: 'Asia/Qatar',
  },
  {
    code: 'DXB',
    name: 'Dubai Office',
    city: 'Dubai',
    state: 'Dubai',
    country: 'United Arab Emirates',
    timezone: 'Asia/Dubai',
  },
];

const DESIGNATION_NAMES: readonly string[] = [
  'Chief Executive Officer',
  'Vice President',
  'Director',
  'Senior Manager',
  'Manager',
  'Team Lead',
  'Senior Engineer',
  'Engineer',
  'Analyst',
  'Associate',
];

const LEVEL_SPECS: readonly { code: string; name: string; rank: number }[] = [
  { code: 'L1', name: 'Associate', rank: 1 },
  { code: 'L2', name: 'Professional', rank: 2 },
  { code: 'L3', name: 'Senior Professional', rank: 3 },
  { code: 'L4', name: 'Lead', rank: 4 },
  { code: 'L5', name: 'Director', rank: 5 },
  { code: 'L6', name: 'Executive', rank: 6 },
];

const EMPLOYMENT_TYPE_SPECS: readonly {
  code: string;
  name: string;
  employeeType: EmployeeType;
  weight: number;
  probationDays: number;
}[] = [
  {
    code: 'FULL_TIME',
    name: 'Full Time',
    employeeType: EmployeeType.FULL_TIME,
    weight: 74,
    probationDays: 90,
  },
  {
    code: 'PART_TIME',
    name: 'Part Time',
    employeeType: EmployeeType.PART_TIME,
    weight: 8,
    probationDays: 60,
  },
  {
    code: 'CONTRACT',
    name: 'Contract',
    employeeType: EmployeeType.CONTRACT,
    weight: 9,
    probationDays: 0,
  },
  {
    code: 'INTERN',
    name: 'Internship',
    employeeType: EmployeeType.INTERN,
    weight: 5,
    probationDays: 0,
  },
  {
    code: 'CONSULTANT',
    name: 'Consultant',
    employeeType: EmployeeType.CONSULTANT,
    weight: 4,
    probationDays: 0,
  },
];

const LEAVE_TYPE_SPECS: readonly {
  code: string;
  name: string;
  category: string;
  isPaid: boolean;
  weight: number;
  annualAllocation: number;
}[] = [
  {
    code: 'ANNUAL',
    name: 'Annual Leave',
    category: 'PAID',
    isPaid: true,
    weight: 44,
    annualAllocation: 21,
  },
  {
    code: 'SICK',
    name: 'Sick Leave',
    category: 'PAID',
    isPaid: true,
    weight: 26,
    annualAllocation: 14,
  },
  {
    code: 'CASUAL',
    name: 'Casual Leave',
    category: 'PAID',
    isPaid: true,
    weight: 14,
    annualAllocation: 7,
  },
  {
    code: 'UNPAID',
    name: 'Unpaid Leave',
    category: 'UNPAID',
    isPaid: false,
    weight: 8,
    annualAllocation: 0,
  },
  {
    code: 'BEREAVEMENT',
    name: 'Bereavement Leave',
    category: 'PAID',
    isPaid: true,
    weight: 4,
    annualAllocation: 5,
  },
  {
    code: 'MATERNITY',
    name: 'Maternity Leave',
    category: 'PAID',
    isPaid: true,
    weight: 4,
    annualAllocation: 70,
  },
];

const FIRST_NAMES: readonly string[] = [
  'Ayesha',
  'Omar',
  'Sara',
  'Bilal',
  'Mariam',
  'Zain',
  'Noor',
  'Hamza',
  'Layla',
  'Yusuf',
  'Fatima',
  'Khalid',
  'Huda',
  'Tariq',
  'Amina',
  'Rashid',
  'Salma',
  'Faisal',
  'Dana',
  'Nasser',
  'Rania',
  'Adnan',
  'Lina',
  'Sami',
  'Reem',
  'Jamal',
  'Hana',
  'Waleed',
  'Zahra',
  'Imran',
  'Nadia',
  'Karim',
];

const LAST_NAMES: readonly string[] = [
  'Khan',
  'Farooq',
  'Ahmed',
  'Hassan',
  'Ali',
  'Malik',
  'Saeed',
  'Raza',
  'Haddad',
  'Nasser',
  'Qureshi',
  'Siddiqui',
  'Mansour',
  'Darwish',
  'Salem',
  'Aziz',
  'Rahman',
  'Bakr',
  'Halabi',
  'Zaidan',
  'Othman',
  'Sultan',
];

const GENDER_WEIGHTS: readonly { value: EmployeeGender; weight: number }[] = [
  { value: EmployeeGender.MALE, weight: 55 },
  { value: EmployeeGender.FEMALE, weight: 41 },
  { value: EmployeeGender.NON_BINARY, weight: 2 },
  { value: EmployeeGender.PREFER_NOT_TO_SAY, weight: 2 },
];

const WORK_MODE_WEIGHTS: readonly {
  value: EmployeeWorkMode;
  weight: number;
}[] = [
  { value: EmployeeWorkMode.OFFICE, weight: 46 },
  { value: EmployeeWorkMode.HYBRID, weight: 34 },
  { value: EmployeeWorkMode.REMOTE, weight: 14 },
  { value: EmployeeWorkMode.FIELD, weight: 6 },
];

const CANDIDATE_SOURCES: readonly string[] = [
  'CAREER_SITE',
  'REFERRAL',
  'LINKEDIN',
  'AGENCY',
  'JOB_BOARD',
  'CAMPUS',
];

const DEVICE_PROFILES: readonly {
  os: string;
  platform: string;
  agentVersion: string;
}[] = [
  { os: 'Windows 11 (26H1)', platform: 'win32', agentVersion: '1.4.2' },
  { os: 'Windows 11 (25H2)', platform: 'win32', agentVersion: '1.4.1' },
  { os: 'Windows 10 (22H2)', platform: 'win32', agentVersion: '1.3.7' },
  { os: 'macOS 15.3', platform: 'darwin', agentVersion: '1.4.2' },
  { os: 'macOS 14.6', platform: 'darwin', agentVersion: '1.3.7' },
  { os: 'Ubuntu 24.04 LTS', platform: 'linux', agentVersion: '1.2.0' },
];

/**
 * One clearly outdated agent build, so an "agents needing upgrade" report has a
 * true positive to find rather than an empty result that looks like a pass.
 */
const OUTDATED_AGENT_VERSION = '0.9.4';

/** The recruitment funnel, in order. `REJECTED` is a terminal side exit. */
const PIPELINE_STAGES: readonly RecruitmentStage[] = [
  RecruitmentStage.APPLIED,
  RecruitmentStage.SCREENING,
  RecruitmentStage.SHORTLISTED,
  RecruitmentStage.INTERVIEW,
  RecruitmentStage.FINAL_REVIEW,
  RecruitmentStage.OFFER,
  RecruitmentStage.HIRED,
];

// ----------------------------------------------------------------- generation

type Db = ReturnType<typeof createPrismaClient>;

interface TenantScale {
  slug: string;
  name: string;
  organizations: number;
  businessUnits: number;
  departments: number;
  teams: number;
  locations: number;
  designations: number;
  levels: number;
  employmentTypes: number;
  leaveTypes: number;
  employees: number;
  /** Employees that produce `AttendanceDay` rows for the whole window. */
  attendanceEmployees: number;
  leaveRequests: number;
  jobOpenings: number;
  candidates: number;
  applications: number;
  devices: number;
  /** How far back desktop telemetry runs. Shorter than the whole window
   *  because the desktop agent is a recent rollout, which is also true of the
   *  real product. */
  telemetryDays: number;
  /** Whether to inject the deliberate data-quality defects. */
  injectDefects: boolean;
}

const MAIN_SCALE: Omit<TenantScale, 'slug' | 'name'> = {
  organizations: 2,
  businessUnits: 4,
  departments: 8,
  teams: 12,
  locations: 4,
  designations: 10,
  levels: 6,
  employmentTypes: 5,
  leaveTypes: 6,
  employees: 240,
  attendanceEmployees: 120,
  leaveRequests: 720,
  jobOpenings: 12,
  candidates: 150,
  applications: 200,
  devices: 60,
  telemetryDays: 150,
  injectDefects: true,
};

const SECONDARY_SCALE: Omit<TenantScale, 'slug' | 'name'> = {
  organizations: 1,
  businessUnits: 2,
  departments: 3,
  teams: 3,
  locations: 1,
  designations: 4,
  levels: 3,
  employmentTypes: 2,
  leaveTypes: 3,
  employees: 30,
  attendanceEmployees: 12,
  leaveRequests: 60,
  jobOpenings: 3,
  candidates: 20,
  applications: 25,
  devices: 5,
  telemetryDays: 60,
  injectDefects: false,
};

interface EmployeeRow {
  id: string;
  index: number;
  employeeCode: string;
  hireDate: Date;
  terminationDate: Date | null;
  employmentStatus: EmployeeEmploymentStatus;
  departmentCode: string | null;
  locationCode: string | null;
  managerId: string | null;
  hierarchyLevel: number;
  businessUnitId: string;
}

interface TenantResult {
  tenantId: string;
  counts: Record<string, number>;
  employees: EmployeeRow[];
}

/**
 * Insert in chunks with `skipDuplicates`.
 *
 * Restartability without 40,000 round trips. Every row carries a deterministic
 * id derived from the same inputs that produce its content, so a row that is
 * already present is already correct — skipping it is not a compromise, it is
 * the definition of idempotent here. `upsert` is used instead wherever a row is
 * small in number and worth updating in place.
 */
async function insertChunked<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
  chunkSize = 1000,
): Promise<number> {
  for (let index = 0; index < rows.length; index += chunkSize) {
    await insert(rows.slice(index, index + chunkSize));
  }
  return rows.length;
}

async function seedTenant(
  prisma: Db,
  scale: TenantScale,
  from: Date,
  to: Date,
  holidays: Set<string>,
): Promise<TenantResult> {
  const slug = scale.slug;
  const counts: Record<string, number> = {};

  // ------------------------------------------------------- tenant + account
  const customerAccountId = fixtureId(slug, 'customer-account');
  await prisma.customerAccount.upsert({
    where: { id: customerAccountId },
    update: { companyName: scale.name, seedSource: 'seed-analytics-fixture' },
    create: {
      id: customerAccountId,
      companyName: scale.name,
      legalCompanyName: `${scale.name} LLC`,
      contactEmail: `accounts@${slug}.fixture.local`,
      country: 'Saudi Arabia',
      status: 'ACTIVE',
      seedSource: 'seed-analytics-fixture',
    },
  });

  const tenantId = fixtureId(slug, 'tenant');
  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {
      name: scale.name,
      slug,
      status: 'ACTIVE',
      seedSource: 'seed-analytics-fixture',
    },
    create: {
      id: tenantId,
      customerAccountId,
      name: scale.name,
      slug,
      status: 'ACTIVE',
      readinessStatus: 'READY',
      readyAt: from,
      seedSource: 'seed-analytics-fixture',
    },
  });
  counts.tenants = 1;

  // ------------------------------------------------------------- structure
  const orgSpecs = ORGANIZATION_SPECS.slice(0, scale.organizations);
  const orgIdByCode = new Map<string, string>();
  for (const spec of orgSpecs) {
    const id = fixtureId(slug, 'organization', spec.code);
    orgIdByCode.set(spec.code, id);
  }
  for (const spec of orgSpecs) {
    const id = orgIdByCode.get(spec.code)!;
    const parentId = spec.parentCode
      ? (orgIdByCode.get(spec.parentCode) ?? null)
      : null;
    await prisma.organization.upsert({
      where: { id },
      update: {
        name: spec.name,
        code: spec.code,
        parentOrganizationId: parentId,
      },
      create: {
        id,
        tenantId,
        code: spec.code,
        name: spec.name,
        parentOrganizationId: parentId,
      },
    });
  }
  counts.organizations = orgSpecs.length;

  const buSpecs = BUSINESS_UNIT_SPECS.slice(0, scale.businessUnits);
  const buIdByCode = new Map<string, string>();
  const buOrgIdByCode = new Map<string, string>();
  for (const spec of buSpecs) {
    buIdByCode.set(spec.code, fixtureId(slug, 'business-unit', spec.code));
  }
  for (const spec of buSpecs) {
    const id = buIdByCode.get(spec.code)!;
    // Fall back to the first organisation when a scale slices the named one
    // away, so a smaller tenant stays internally consistent.
    const organizationId =
      orgIdByCode.get(spec.organizationCode) ??
      orgIdByCode.get(orgSpecs[0].code)!;
    const parentBusinessUnitId = spec.parentCode
      ? (buIdByCode.get(spec.parentCode) ?? null)
      : null;
    buOrgIdByCode.set(spec.code, organizationId);
    await prisma.businessUnit.upsert({
      where: { id },
      update: { name: spec.name, organizationId, parentBusinessUnitId },
      create: {
        id,
        tenantId,
        code: spec.code,
        name: spec.name,
        organizationId,
        parentBusinessUnitId,
      },
    });
  }
  counts.businessUnits = buSpecs.length;

  const deptSpecs = DEPARTMENT_SPECS.slice(0, scale.departments);
  const deptIdByCode = new Map<string, string>();
  const deptBuCodeByCode = new Map<string, string>();
  for (const spec of deptSpecs) {
    const id = fixtureId(slug, 'department', spec.code);
    const buCode = buIdByCode.has(spec.businessUnitCode)
      ? spec.businessUnitCode
      : buSpecs[0].code;
    deptIdByCode.set(spec.code, id);
    deptBuCodeByCode.set(spec.code, buCode);
    await prisma.department.upsert({
      where: { id },
      update: { name: spec.name, businessUnitId: buIdByCode.get(buCode)! },
      create: {
        id,
        tenantId,
        code: spec.code,
        name: spec.name,
        businessUnitId: buIdByCode.get(buCode)!,
      },
    });
  }
  counts.departments = deptSpecs.length;

  const teamSpecs = TEAM_SPECS.filter((spec) =>
    deptIdByCode.has(spec.departmentCode),
  ).slice(0, scale.teams);
  const teamIdsByDeptCode = new Map<string, string[]>();
  for (const spec of teamSpecs) {
    const id = fixtureId(slug, 'team', spec.key);
    const buCode = deptBuCodeByCode.get(spec.departmentCode)!;
    await prisma.team.upsert({
      where: { id },
      update: {
        name: spec.name,
        departmentId: deptIdByCode.get(spec.departmentCode)!,
        businessUnitId: buIdByCode.get(buCode)!,
      },
      create: {
        id,
        tenantId,
        key: spec.key,
        name: spec.name,
        teamType: 'ORGANIZATIONAL',
        departmentId: deptIdByCode.get(spec.departmentCode)!,
        businessUnitId: buIdByCode.get(buCode)!,
      },
    });
    const existing = teamIdsByDeptCode.get(spec.departmentCode) ?? [];
    existing.push(id);
    teamIdsByDeptCode.set(spec.departmentCode, existing);
  }
  counts.teams = teamSpecs.length;

  const locationSpecs = LOCATION_SPECS.slice(0, scale.locations);
  const locationIdByCode = new Map<string, string>();
  for (const spec of locationSpecs) {
    const id = fixtureId(slug, 'location', spec.code);
    locationIdByCode.set(spec.code, id);
    await prisma.location.upsert({
      where: { id },
      update: { name: spec.name, city: spec.city, isActive: true },
      create: {
        id,
        tenantId,
        code: spec.code,
        name: spec.name,
        city: spec.city,
        state: spec.state,
        country: spec.country,
        timezone: spec.timezone,
        organizationId: orgIdByCode.get(orgSpecs[0].code)!,
      },
    });
  }
  counts.locations = locationSpecs.length;

  const levelSpecs = LEVEL_SPECS.slice(0, scale.levels);
  const levelIdByCode = new Map<string, string>();
  for (const spec of levelSpecs) {
    levelIdByCode.set(spec.code, fixtureId(slug, 'employee-level', spec.code));
  }
  /*
   * Highest rank first. Each level points at the one above it, so the parent
   * row has to exist before the child is written — the foreign key is checked
   * on insert, not deferred.
   */
  for (let index = levelSpecs.length - 1; index >= 0; index -= 1) {
    const spec = levelSpecs[index];
    // The level above, where there is one — a career ladder, not a flat list.
    const parentSpec = levelSpecs[index + 1];
    await prisma.employeeLevel.upsert({
      where: { id: levelIdByCode.get(spec.code)! },
      update: {
        name: spec.name,
        rank: spec.rank,
        parentEmployeeLevelId: parentSpec
          ? levelIdByCode.get(parentSpec.code)!
          : null,
      },
      create: {
        id: levelIdByCode.get(spec.code)!,
        tenantId,
        code: spec.code,
        name: spec.name,
        rank: spec.rank,
        parentEmployeeLevelId: parentSpec
          ? levelIdByCode.get(parentSpec.code)!
          : null,
      },
    });
  }
  counts.employeeLevels = levelSpecs.length;

  const designationNames = DESIGNATION_NAMES.slice(0, scale.designations);
  const designationIds: string[] = [];
  for (let index = 0; index < designationNames.length; index += 1) {
    const name = designationNames[index];
    const id = fixtureId(slug, 'designation', name);
    designationIds.push(id);
    // Seniority runs top-down through DESIGNATION_NAMES, so map index 0 to the
    // highest level rather than the lowest.
    const levelSpec =
      levelSpecs[
        Math.max(
          0,
          levelSpecs.length -
            1 -
            Math.floor((index * levelSpecs.length) / designationNames.length),
        )
      ];
    await prisma.designation.upsert({
      where: { id },
      update: { name, employeeLevelId: levelIdByCode.get(levelSpec.code)! },
      create: {
        id,
        tenantId,
        name,
        level: levelSpec.code,
        employeeLevelId: levelIdByCode.get(levelSpec.code)!,
      },
    });
  }
  counts.designations = designationNames.length;

  const employmentTypeSpecs = EMPLOYMENT_TYPE_SPECS.slice(
    0,
    scale.employmentTypes,
  );
  const employmentTypeIdByCode = new Map<string, string>();
  for (const spec of employmentTypeSpecs) {
    const id = fixtureId(slug, 'employment-type', spec.code);
    employmentTypeIdByCode.set(spec.code, id);
    await prisma.employmentType.upsert({
      where: { id },
      update: { name: spec.name, defaultProbationDays: spec.probationDays },
      create: {
        id,
        tenantId,
        code: spec.code,
        name: spec.name,
        defaultProbationDays: spec.probationDays,
        overtimeEligible: spec.code === 'FULL_TIME',
      },
    });
  }
  counts.employmentTypes = employmentTypeSpecs.length;

  // -------------------------------------------------------------- employees
  const employees = buildEmployeeRows(
    scale,
    from,
    to,
    buIdByCode,
    deptSpecs,
    locationSpecs,
    deptBuCodeByCode,
  );

  /*
   * Created in hierarchy order so `managerEmployeeId` can be set on the insert
   * itself: the manager row always exists by the time a report is written. The
   * alternative — insert everyone, then update 240 rows — costs a second round
   * trip per employee for no gain.
   */
  for (let level = 0; level <= 3; level += 1) {
    const cohort = employees.filter((row) => row.hierarchyLevel === level);
    for (const row of cohort) {
      const first = pick(FIRST_NAMES, slug, 'first', row.index);
      const last = pick(LAST_NAMES, slug, 'last', row.index);
      const employmentTypeSpec = pickWeighted(
        employmentTypeSpecs.map((spec) => ({
          value: spec,
          weight: spec.weight,
        })),
        slug,
        'employment-type',
        row.index,
      );
      const deptCode = row.departmentCode;
      const teamCandidates = deptCode
        ? (teamIdsByDeptCode.get(deptCode) ?? [])
        : [];
      const designationIndex = Math.min(
        designationIds.length - 1,
        row.hierarchyLevel === 0
          ? 0
          : row.hierarchyLevel === 1
            ? 1
            : row.hierarchyLevel === 2
              ? intBetween(2, 4, slug, 'designation', row.index)
              : intBetween(
                  Math.min(5, designationIds.length - 1),
                  designationIds.length - 1,
                  slug,
                  'designation',
                  row.index,
                ),
      );
      const buCode = deptCode
        ? deptBuCodeByCode.get(deptCode)!
        : buSpecs[0].code;

      await prisma.employee.upsert({
        where: { id: row.id },
        update: {
          firstName: first,
          lastName: last,
          employmentStatus: row.employmentStatus,
          hireDate: row.hireDate,
          terminationDate: row.terminationDate,
          managerEmployeeId: row.managerId,
          departmentId: deptCode ? deptIdByCode.get(deptCode)! : null,
          locationId: row.locationCode
            ? locationIdByCode.get(row.locationCode)!
            : null,
        },
        create: {
          id: row.id,
          tenantId,
          employeeCode: row.employeeCode,
          recordType: EmployeeRecordType.INTERNAL_EMPLOYEE,
          firstName: first,
          lastName: last,
          email: `${row.employeeCode.toLowerCase()}@${slug}.fixture.local`,
          phone: `+9665${String(10000000 + row.index).slice(0, 8)}`,
          gender: pickWeighted(GENDER_WEIGHTS, slug, 'gender', row.index),
          dateOfBirth: addDays(
            new Date(Date.UTC(1985, 0, 1)),
            intBetween(0, 5000, slug, 'dob', row.index),
          ),
          employmentStatus: row.employmentStatus,
          employeeType: employmentTypeSpec.employeeType,
          employmentTypeId: employmentTypeIdByCode.get(
            employmentTypeSpec.code,
          )!,
          workMode: pickWeighted(
            WORK_MODE_WEIGHTS,
            slug,
            'work-mode',
            row.index,
          ),
          hireDate: row.hireDate,
          probationEndDate:
            employmentTypeSpec.probationDays > 0
              ? addDays(row.hireDate, employmentTypeSpec.probationDays)
              : null,
          confirmationDate:
            row.employmentStatus === EmployeeEmploymentStatus.PROBATION
              ? null
              : addDays(row.hireDate, employmentTypeSpec.probationDays),
          terminationDate: row.terminationDate,
          organizationId: buOrgIdByCode.get(buCode)!,
          businessUnitId: row.businessUnitId,
          departmentId: deptCode ? deptIdByCode.get(deptCode)! : null,
          teamId:
            teamCandidates.length > 0
              ? pick(teamCandidates, slug, 'team', row.index)
              : null,
          designationId: designationIds[designationIndex],
          employeeLevelId: levelIdByCode.get(
            levelSpecs[
              Math.max(
                0,
                levelSpecs.length -
                  1 -
                  Math.min(row.hierarchyLevel, levelSpecs.length - 1),
              )
            ].code,
          )!,
          locationId: row.locationCode
            ? locationIdByCode.get(row.locationCode)!
            : null,
          managerEmployeeId: row.managerId,
        },
      });
    }
  }
  counts.employees = employees.length;

  // -------------------------------------------------------- users (for agent)
  /*
   * `EmployeeDevice`, `WorkSession` and `DailyProductivitySummary` all require a
   * `User`, so telemetry cannot exist without workspace accounts. Only the
   * telemetry subset gets one — the fixture is about report inputs, not about
   * provisioning logins.
   */
  const telemetryEmployees = selectTelemetryEmployees(employees, scale.devices);
  const userIdByEmployeeId = new Map<string, string>();
  for (const row of telemetryEmployees) {
    const email = `${row.employeeCode.toLowerCase()}.user@${slug}.fixture.local`;
    /*
     * A syntactically invalid bcrypt hash, on purpose. bcryptjs returns false
     * for it rather than throwing, so these accounts exist for foreign keys and
     * can never be signed into. Hashing a real password 60+ times would also
     * dominate the runtime of the whole generator for no benefit.
     */
    const placeholderHash = `$2b$10$analytics.fixture.placeholder.not.a.credential`;
    const identityId = await ensureIdentityForEmail(
      prisma,
      email,
      placeholderHash,
    );
    const userId = fixtureId(slug, 'user', row.employeeCode);
    await prisma.user.upsert({
      where: { id: userId },
      update: { identityId, businessUnitId: row.businessUnitId },
      create: {
        id: userId,
        tenantId,
        identityId,
        businessUnitId: row.businessUnitId,
        firstName: pick(FIRST_NAMES, slug, 'first', row.index),
        lastName: pick(LAST_NAMES, slug, 'last', row.index),
        email,
        passwordHash: placeholderHash,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.employee.update({
      where: { id: row.id },
      data: { userId },
    });
    userIdByEmployeeId.set(row.id, userId);
  }
  counts.users = telemetryEmployees.length;

  // ------------------------------------------------------------------- leave
  const leaveTypeSpecs = LEAVE_TYPE_SPECS.slice(0, scale.leaveTypes);
  const leaveTypeIdByCode = new Map<string, string>();
  for (const spec of leaveTypeSpecs) {
    const id = fixtureId(slug, 'leave-type', spec.code);
    leaveTypeIdByCode.set(spec.code, id);
    await prisma.leaveType.upsert({
      where: { id },
      update: { name: spec.name, category: spec.category, isPaid: spec.isPaid },
      create: {
        id,
        tenantId,
        code: spec.code,
        name: spec.name,
        category: spec.category,
        isPaid: spec.isPaid,
        allowHalfDay: true,
      },
    });
  }
  counts.leaveTypes = leaveTypeSpecs.length;

  const leaveRequestRows: Prisma.LeaveRequestCreateManyInput[] = [];
  const windowDays = daysBetween(from, to);
  for (let index = 0; index < scale.leaveRequests; index += 1) {
    const employee =
      employees[intBetween(0, employees.length - 1, slug, 'leave-emp', index)];
    const startOffset = intBetween(
      0,
      windowDays - 1,
      slug,
      'leave-start',
      index,
    );
    const startDate = addDays(from, startOffset);
    // Only leave that falls inside the person's employment is meaningful.
    if (startDate < employee.hireDate) continue;
    if (employee.terminationDate && startDate > employee.terminationDate)
      continue;
    const spec = pickWeighted(
      leaveTypeSpecs.map((entry) => ({ value: entry, weight: entry.weight })),
      slug,
      'leave-type-pick',
      index,
    );
    // Halves included, because a leave-days metric that never meets a 0.5 has
    // not been tested against the thing the schema models (Decimal(8,2)).
    const halfDay = chance(0.18, slug, 'leave-half', index);
    const wholeDays = intBetween(
      1,
      spec.code === 'MATERNITY' ? 45 : 6,
      slug,
      'leave-len',
      index,
    );
    const totalDays = halfDay ? wholeDays - 0.5 : wholeDays;
    const endDate = addDays(startDate, Math.max(0, Math.ceil(totalDays) - 1));
    const status = pickWeighted(
      [
        { value: LeaveRequestStatus.APPROVED, weight: 68 },
        { value: LeaveRequestStatus.PENDING, weight: 14 },
        { value: LeaveRequestStatus.REJECTED, weight: 11 },
        { value: LeaveRequestStatus.CANCELLED, weight: 7 },
      ],
      slug,
      'leave-status',
      index,
    );
    leaveRequestRows.push({
      id: fixtureId(slug, 'leave-request', index),
      tenantId,
      employeeId: employee.id,
      leaveTypeId: leaveTypeIdByCode.get(spec.code)!,
      startDate,
      endDate,
      totalDays: new Prisma.Decimal(totalDays.toFixed(2)),
      status,
      reason: `${spec.name} request (fixture ${index})`,
      createdAt: addDays(
        startDate,
        -intBetween(1, 21, slug, 'leave-lead', index),
      ),
    });
  }
  counts.leaveRequests = await insertChunked(leaveRequestRows, (chunk) =>
    prisma.leaveRequest.createMany({ data: chunk, skipDuplicates: true }),
  );

  const leaveBalanceRows: Prisma.LeaveBalanceCreateManyInput[] = [];
  for (const employee of employees) {
    if (employee.employmentStatus === EmployeeEmploymentStatus.TERMINATED)
      continue;
    for (const spec of leaveTypeSpecs.slice(0, 3)) {
      const allocated = spec.annualAllocation;
      const used = Math.min(
        allocated,
        intBetween(
          0,
          Math.max(0, allocated),
          slug,
          'balance-used',
          employee.index,
          spec.code,
        ),
      );
      leaveBalanceRows.push({
        id: fixtureId(slug, 'leave-balance', employee.index, spec.code),
        tenantId,
        employeeId: employee.id,
        leaveTypeId: leaveTypeIdByCode.get(spec.code)!,
        totalAllocated: new Prisma.Decimal(allocated),
        totalUsed: new Prisma.Decimal(used),
        totalRemaining: new Prisma.Decimal(allocated - used),
      });
    }
  }
  counts.leaveBalances = await insertChunked(leaveBalanceRows, (chunk) =>
    prisma.leaveBalance.createMany({ data: chunk, skipDuplicates: true }),
  );

  // -------------------------------------------------------- attendance days
  const attendanceEmployees = employees
    .filter((row) => row.hierarchyLevel > 0)
    .slice(0, scale.attendanceEmployees);
  const attendanceRows: Prisma.AttendanceDayCreateManyInput[] = [];
  // Rows within this many days of the window end are left PENDING: the
  // reconciliation engine has not run on them yet. A correct attendance-rate
  // denominator must exclude them, and it cannot be shown to if none exist.
  const pendingHorizon = 4;
  for (const employee of attendanceEmployees) {
    const start = employee.hireDate > from ? employee.hireDate : from;
    const end =
      employee.terminationDate && employee.terminationDate < to
        ? employee.terminationDate
        : to;
    for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
      const key = isoDay(day);
      const weekend = isWeekendDay(day);
      const holiday = !weekend && holidays.has(key);
      const row: Prisma.AttendanceDayCreateManyInput = {
        id: fixtureId(slug, 'attendance-day', employee.employeeCode, key),
        tenantId,
        employeeId: employee.id,
        attendanceDate: day,
        timezone: 'Asia/Riyadh',
        status: AttendanceDayStatus.PENDING,
        isWeekend: weekend,
        isHoliday: holiday,
        lastReconciledAt: addDays(day, 1),
      };

      if (weekend) {
        row.status = AttendanceDayStatus.WEEKEND;
      } else if (holiday) {
        row.status = AttendanceDayStatus.HOLIDAY;
      } else if (daysBetween(day, to) < pendingHorizon) {
        row.status = AttendanceDayStatus.PENDING;
        row.scheduledMinutes = 480;
        row.lastReconciledAt = null;
      } else {
        row.scheduledMinutes = 480;
        row.breakMinutes = 60;
        const draw = unit(slug, 'attendance-draw', employee.employeeCode, key);
        if (draw < 0.06) {
          row.status = AttendanceDayStatus.ON_LEAVE;
          row.onLeave = true;
          row.leaveMinutes = 480;
        } else if (draw < 0.095) {
          row.status = AttendanceDayStatus.ABSENT;
        } else if (draw < 0.105) {
          row.status = AttendanceDayStatus.NEEDS_REVIEW;
          row.openExceptionCount = 1;
          row.workedMinutes = intBetween(
            120,
            360,
            slug,
            'nr-worked',
            employee.employeeCode,
            key,
          );
          row.sessionCount = 1;
        } else if (draw < 0.15) {
          row.status = AttendanceDayStatus.PARTIAL;
          row.workedMinutes = intBetween(
            180,
            400,
            slug,
            'partial',
            employee.employeeCode,
            key,
          );
          row.earlyDepartureMinutes = 480 - row.workedMinutes;
          row.sessionCount = 1;
        } else {
          row.status = AttendanceDayStatus.PRESENT;
          const late = chance(0.22, slug, 'late', employee.employeeCode, key)
            ? intBetween(5, 75, slug, 'late-mins', employee.employeeCode, key)
            : 0;
          const extra = chance(0.24, slug, 'extra', employee.employeeCode, key)
            ? intBetween(
                15,
                150,
                slug,
                'extra-mins',
                employee.employeeCode,
                key,
              )
            : 0;
          const early = chance(0.09, slug, 'early', employee.employeeCode, key)
            ? intBetween(10, 60, slug, 'early-mins', employee.employeeCode, key)
            : 0;
          row.lateMinutes = late;
          row.extraMinutes = extra;
          row.earlyDepartureMinutes = early;
          row.earlyArrivalMinutes = chance(
            0.15,
            slug,
            'early-arrival',
            employee.employeeCode,
            key,
          )
            ? intBetween(5, 40, slug, 'ea-mins', employee.employeeCode, key)
            : 0;
          row.approvedOvertimeMinutes = extra > 60 ? extra - 30 : 0;
          row.workedMinutes = 480 - early + extra;
          row.sessionCount = chance(
            0.2,
            slug,
            'sessions',
            employee.employeeCode,
            key,
          )
            ? 2
            : 1;
          const checkIn = atTime(day, 9 * 60 + late);
          row.firstCheckInAt = checkIn;
          row.lastCheckOutAt = new Date(
            checkIn.getTime() + (row.workedMinutes + 60) * 60 * 1000,
          );
          row.derivedWorkMode = pickWeighted(
            WORK_MODE_WEIGHTS,
            slug,
            'derived-mode',
            employee.employeeCode,
            key,
          );
          if (row.derivedWorkMode === EmployeeWorkMode.REMOTE) {
            row.remoteMinutes = row.workedMinutes;
          } else if (row.derivedWorkMode === EmployeeWorkMode.FIELD) {
            row.fieldMinutes = row.workedMinutes;
          } else {
            row.officeMinutes = row.workedMinutes;
          }
        }
      }
      attendanceRows.push(row);
    }
  }
  counts.attendanceDays = await insertChunked(attendanceRows, (chunk) =>
    prisma.attendanceDay.createMany({ data: chunk, skipDuplicates: true }),
  );

  // ------------------------------------------------------------ recruitment
  const pipelineId = fixtureId(slug, 'pipeline');
  await prisma.recruitmentPipeline.upsert({
    where: { id: pipelineId },
    update: { name: `${scale.name} Standard Pipeline` },
    create: {
      id: pipelineId,
      tenantId,
      name: `${scale.name} Standard Pipeline`,
      code: 'STANDARD',
      isDefault: true,
    },
  });
  const stageRows = [...PIPELINE_STAGES, RecruitmentStage.REJECTED].map(
    (stage, order) => ({
      id: fixtureId(slug, 'pipeline-stage', stage),
      tenantId,
      pipelineId,
      stageKey: stage,
      label: stage
        .split('_')
        .map((part) => part[0] + part.slice(1).toLowerCase())
        .join(' '),
      sortOrder: order,
      isTerminal:
        stage === RecruitmentStage.HIRED || stage === RecruitmentStage.REJECTED,
    }),
  );
  await prisma.recruitmentPipelineStage.createMany({
    data: stageRows,
    skipDuplicates: true,
  });
  counts.recruitmentPipelineStages = stageRows.length;

  const openingStatuses: JobOpeningStatus[] = [
    JobOpeningStatus.OPEN,
    JobOpeningStatus.OPEN,
    JobOpeningStatus.OPEN,
    JobOpeningStatus.OPEN,
    JobOpeningStatus.OPEN,
    JobOpeningStatus.FILLED,
    JobOpeningStatus.FILLED,
    JobOpeningStatus.CLOSED,
    JobOpeningStatus.CLOSED,
    JobOpeningStatus.ON_HOLD,
    JobOpeningStatus.DRAFT,
    JobOpeningStatus.CANCELLED,
  ];
  const openingIds: string[] = [];
  for (let index = 0; index < scale.jobOpenings; index += 1) {
    const id = fixtureId(slug, 'job-opening', index);
    openingIds.push(id);
    const deptSpec = deptSpecs[index % deptSpecs.length];
    const title = `${deptSpec.name} — ${pick(DESIGNATION_NAMES.slice(2), slug, 'opening-title', index)}`;
    await prisma.jobOpening.upsert({
      where: { id },
      update: {
        title,
        status: openingStatuses[index % openingStatuses.length],
      },
      create: {
        id,
        tenantId,
        pipelineId,
        title,
        code: `REQ-${String(1000 + index)}`,
        status: openingStatuses[index % openingStatuses.length],
        createdAt: addDays(
          from,
          intBetween(0, windowDays - 30, slug, 'opening-created', index),
        ),
      },
    });
  }
  counts.jobOpenings = scale.jobOpenings;

  const candidateIds: string[] = [];
  const candidateRows: Prisma.CandidateCreateManyInput[] = [];
  for (let index = 0; index < scale.candidates; index += 1) {
    const id = fixtureId(slug, 'candidate', index);
    candidateIds.push(id);
    const first = pick(FIRST_NAMES, slug, 'cand-first', index);
    const last = pick(LAST_NAMES, slug, 'cand-last', index);
    candidateRows.push({
      id,
      tenantId,
      firstName: first,
      lastName: last,
      email: `candidate.${index}@${slug}.fixture.local`,
      phone: `+9665${String(90000000 + index).slice(0, 8)}`,
      source: pick(CANDIDATE_SOURCES, slug, 'cand-source', index),
      gender: pickWeighted(GENDER_WEIGHTS, slug, 'cand-gender', index),
      totalYearsExperience: new Prisma.Decimal(
        intBetween(0, 200, slug, 'cand-exp', index) / 10,
      ),
      expectedSalary: new Prisma.Decimal(
        intBetween(8000, 45000, slug, 'cand-salary', index),
      ),
      noticePeriodDays: pick([0, 15, 30, 60, 90], slug, 'cand-notice', index),
      createdAt: addDays(
        from,
        intBetween(0, windowDays - 1, slug, 'cand-created', index),
      ),
    });
  }
  counts.candidates = await insertChunked(candidateRows, (chunk) =>
    prisma.candidate.createMany({ data: chunk, skipDuplicates: true }),
  );

  /*
   * Applications, and the stage transitions behind them.
   *
   * The transition rows are the point. Without `ApplicationStageHistory` a
   * funnel can only be drawn from current stage — which cannot say how many
   * candidates ever reached interview, how long they sat in each stage, or what
   * time-to-hire was. Every application here carries the full chain it walked.
   */
  const applicationRows: Prisma.ApplicationCreateManyInput[] = [];
  const stageHistoryRows: Prisma.ApplicationStageHistoryCreateManyInput[] = [];
  const hiredApplications: {
    applicationId: string;
    candidateId: string;
    jobOpeningId: string;
    hiredAt: Date;
  }[] = [];
  const usedPairs = new Set<string>();
  for (let index = 0; index < scale.applications; index += 1) {
    const candidateId = candidateIds[index % candidateIds.length];
    // A second application for some candidates, which is what makes
    // "applications per candidate" a real number rather than always 1.
    const openingOffset =
      index < candidateIds.length
        ? intBetween(0, openingIds.length - 1, slug, 'app-open', index)
        : intBetween(0, openingIds.length - 1, slug, 'app-open-2', index);
    let jobOpeningId = openingIds[openingOffset];
    let attempt = 0;
    while (
      usedPairs.has(`${candidateId}|${jobOpeningId}`) &&
      attempt < openingIds.length
    ) {
      attempt += 1;
      jobOpeningId = openingIds[(openingOffset + attempt) % openingIds.length];
    }
    if (usedPairs.has(`${candidateId}|${jobOpeningId}`)) continue;
    usedPairs.add(`${candidateId}|${jobOpeningId}`);

    const applicationId = fixtureId(slug, 'application', index);
    const appliedAt = addDays(
      from,
      intBetween(0, Math.max(1, windowDays - 40), slug, 'app-applied', index),
    );
    // Where this application stopped. Weighted so the funnel narrows.
    const furthest = pickWeighted(
      [
        { value: 0, weight: 16 },
        { value: 1, weight: 20 },
        { value: 2, weight: 16 },
        { value: 3, weight: 16 },
        { value: 4, weight: 10 },
        { value: 5, weight: 9 },
        { value: 6, weight: 13 },
      ],
      slug,
      'app-depth',
      index,
    );
    const rejected = furthest < 6 && chance(0.55, slug, 'app-rejected', index);

    let cursor = appliedAt;
    let previous: RecruitmentStage | null = null;
    for (let step = 0; step <= furthest; step += 1) {
      const stage = PIPELINE_STAGES[step];
      stageHistoryRows.push({
        id: fixtureId(slug, 'stage-history', index, step),
        tenantId,
        applicationId,
        fromStage: previous,
        toStage: stage,
        changedAt: cursor,
        note: `Moved to ${stage} (fixture)`,
        createdAt: cursor,
      });
      previous = stage;
      cursor = addDays(
        cursor,
        intBetween(1, 12, slug, 'stage-gap', index, step),
      );
    }

    let finalStage = PIPELINE_STAGES[furthest];
    let rejectedAt: Date | null = null;
    if (rejected) {
      stageHistoryRows.push({
        id: fixtureId(slug, 'stage-history', index, 'rejected'),
        tenantId,
        applicationId,
        fromStage: finalStage,
        toStage: RecruitmentStage.REJECTED,
        changedAt: cursor,
        note: 'Rejected (fixture)',
        createdAt: cursor,
      });
      rejectedAt = cursor;
      finalStage = RecruitmentStage.REJECTED;
    } else if (furthest === 6) {
      hiredApplications.push({
        applicationId,
        candidateId,
        jobOpeningId,
        hiredAt: cursor,
      });
    }

    applicationRows.push({
      id: applicationId,
      tenantId,
      candidateId,
      jobOpeningId,
      stage: finalStage,
      appliedAt,
      movedAt: cursor,
      rejectedAt,
      rejectionReason: rejected
        ? 'Stronger candidates available (fixture)'
        : null,
      matchScore: intBetween(30, 98, slug, 'app-score', index),
      createdAt: appliedAt,
    });
  }
  counts.applications = await insertChunked(applicationRows, (chunk) =>
    prisma.application.createMany({ data: chunk, skipDuplicates: true }),
  );
  counts.applicationStageHistory = await insertChunked(
    stageHistoryRows,
    (chunk) =>
      prisma.applicationStageHistory.createMany({
        data: chunk,
        skipDuplicates: true,
      }),
  );

  /*
   * Link hired applications to the employees they became.
   *
   * `Employee.sourceApplicationId` is globally unique, so this is a strict 1:1.
   * It is what makes time-to-hire and source-of-hire computable end to end
   * rather than stopping at the application boundary.
   */
  const hireLinkCandidates = employees.filter(
    (row) => row.hierarchyLevel === 3 && row.hireDate >= from,
  );
  let linkedHires = 0;
  for (let index = 0; index < hiredApplications.length; index += 1) {
    const employee = hireLinkCandidates[index];
    if (!employee) break;
    const hire = hiredApplications[index];
    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        sourceApplicationId: hire.applicationId,
        sourceCandidateId: hire.candidateId,
        sourceJobOpeningId: hire.jobOpeningId,
      },
    });
    await prisma.candidate.update({
      where: { id: hire.candidateId },
      data: { currentStatus: RecruitmentStage.HIRED },
    });
    linkedHires += 1;
  }
  counts.hiredApplicationsLinkedToEmployees = linkedHires;

  // ------------------------------------------------------- desktop telemetry
  const telemetryFrom = addDays(to, -scale.telemetryDays);
  const deviceRows: {
    deviceId: string;
    employee: EmployeeRow;
    userId: string;
    stoppedAt: Date | null;
  }[] = [];
  for (let index = 0; index < telemetryEmployees.length; index += 1) {
    const employee = telemetryEmployees[index];
    const userId = userIdByEmployeeId.get(employee.id)!;
    const profile = pick(DEVICE_PROFILES, slug, 'device-profile', index);
    // Exactly one device is left on a clearly outdated agent build.
    const outdated = index === 3;
    // Exactly one device stops reporting partway through the window while
    // still marked active — the real failure mode, where nothing errors and
    // the row simply goes quiet.
    const stoppedAt =
      index === 7
        ? addDays(telemetryFrom, Math.floor(scale.telemetryDays / 2))
        : null;
    const deviceId = fixtureId(slug, 'device', employee.employeeCode);
    await prisma.employeeDevice.upsert({
      where: { id: deviceId },
      update: {
        agentVersion: outdated ? OUTDATED_AGENT_VERSION : profile.agentVersion,
        lastSeenAt:
          stoppedAt ??
          addDays(to, -intBetween(0, 3, slug, 'device-seen', index)),
      },
      create: {
        id: deviceId,
        tenantId,
        employeeId: employee.id,
        userId,
        deviceFingerprint: `fixture-${slug}-${employee.employeeCode.toLowerCase()}`,
        deviceName: `${employee.employeeCode} ${profile.platform === 'darwin' ? 'MacBook' : 'Workstation'}`,
        os: profile.os,
        platform: profile.platform,
        agentVersion: outdated ? OUTDATED_AGENT_VERSION : profile.agentVersion,
        cameraPermission: pick(
          ['GRANTED', 'DENIED', 'UNKNOWN'],
          slug,
          'cam',
          index,
        ),
        microphonePermission: pick(
          ['GRANTED', 'DENIED', 'UNKNOWN'],
          slug,
          'mic',
          index,
        ),
        locationPermission: pick(
          ['GRANTED', 'DENIED', 'UNKNOWN'],
          slug,
          'loc',
          index,
        ),
        permissionUpdatedAt: telemetryFrom,
        lastSeenAt:
          stoppedAt ??
          addDays(to, -intBetween(0, 3, slug, 'device-seen', index)),
        isActive: true,
      },
    });
    deviceRows.push({ deviceId, employee, userId, stoppedAt });
  }
  counts.employeeDevices = deviceRows.length;

  const sessionRows: Prisma.WorkSessionCreateManyInput[] = [];
  const summaryRows: Prisma.DailyProductivitySummaryCreateManyInput[] = [];
  for (const device of deviceRows) {
    const employeeStart =
      device.employee.hireDate > telemetryFrom
        ? device.employee.hireDate
        : telemetryFrom;
    const employeeEnd =
      device.employee.terminationDate && device.employee.terminationDate < to
        ? device.employee.terminationDate
        : to;
    const end =
      device.stoppedAt && device.stoppedAt < employeeEnd
        ? device.stoppedAt
        : employeeEnd;
    for (let day = new Date(employeeStart); day <= end; day = addDays(day, 1)) {
      if (isWeekendDay(day)) continue;
      const key = isoDay(day);
      if (holidays.has(key)) continue;
      if (
        chance(0.08, slug, 'telemetry-gap', device.employee.employeeCode, key)
      )
        continue;

      const loggedIn = intBetween(
        21600,
        34200,
        slug,
        'logged',
        device.employee.employeeCode,
        key,
      );
      const idle = Math.floor(
        loggedIn *
          (0.08 + unit(slug, 'idle', device.employee.employeeCode, key) * 0.22),
      );
      const away = Math.floor(
        loggedIn *
          (0.03 + unit(slug, 'away', device.employee.employeeCode, key) * 0.12),
      );
      const active = loggedIn - idle - away;
      const startedAt = atTime(
        day,
        9 * 60 +
          intBetween(-30, 60, slug, 'start', device.employee.employeeCode, key),
      );
      sessionRows.push({
        id: fixtureId(slug, 'work-session', device.employee.employeeCode, key),
        tenantId,
        employeeId: device.employee.id,
        userId: device.userId,
        deviceId: device.deviceId,
        startedAt,
        endedAt: new Date(startedAt.getTime() + loggedIn * 1000),
        lastHeartbeatAt: new Date(startedAt.getTime() + loggedIn * 1000),
        status: WorkSessionStatus.ENDED,
        totalActiveSeconds: active,
        totalIdleSeconds: idle,
        totalAwaySeconds: away,
      });
      summaryRows.push({
        id: fixtureId(slug, 'productivity', device.employee.employeeCode, key),
        tenantId,
        employeeId: device.employee.id,
        userId: device.userId,
        date: day,
        loggedInSeconds: loggedIn,
        activeSeconds: active,
        idleSeconds: idle,
        awaySeconds: away,
        utilizationPercent: new Prisma.Decimal(
          ((active / loggedIn) * 100).toFixed(2),
        ),
        lastCalculatedAt: addDays(day, 1),
      });
    }
  }

  /*
   * An orphaned session: started, never ended, still ACTIVE, weeks ago.
   *
   * The real system never reaps these — a machine that sleeps or loses power
   * mid-session leaves the row exactly like this. Any "hours worked" metric
   * that sums `endedAt - startedAt`, or that treats ACTIVE as "working right
   * now", is wrong in a way only this row exposes.
   */
  if (deviceRows.length > 0) {
    const orphanDevice = deviceRows[0];
    const orphanStart = atTime(addDays(to, -37), 9 * 60);
    sessionRows.push({
      id: fixtureId(slug, 'work-session-orphan'),
      tenantId,
      employeeId: orphanDevice.employee.id,
      userId: orphanDevice.userId,
      deviceId: orphanDevice.deviceId,
      startedAt: orphanStart,
      endedAt: null,
      lastHeartbeatAt: new Date(orphanStart.getTime() + 4 * 60 * 60 * 1000),
      status: WorkSessionStatus.ACTIVE,
      totalActiveSeconds: 12_600,
      totalIdleSeconds: 1_800,
      totalAwaySeconds: 0,
    });
  }

  counts.workSessions = await insertChunked(sessionRows, (chunk) =>
    prisma.workSession.createMany({ data: chunk, skipDuplicates: true }),
  );
  counts.dailyProductivitySummaries = await insertChunked(
    summaryRows,
    (chunk) =>
      prisma.dailyProductivitySummary.createMany({
        data: chunk,
        skipDuplicates: true,
      }),
  );

  return { tenantId, counts, employees };
}

/**
 * The employee roster, decided before anything is written.
 *
 * Separated from the insert loop so the whole population — hierarchy, status
 * mix, hire and termination dates, and the deliberate defects — is one
 * readable decision rather than something that emerges from a loop body.
 */
function buildEmployeeRows(
  scale: TenantScale,
  from: Date,
  to: Date,
  buIdByCode: Map<string, string>,
  deptSpecs: readonly DepartmentSpec[],
  locationSpecs: readonly LocationSpec[],
  deptBuCodeByCode: Map<string, string>,
): EmployeeRow[] {
  const slug = scale.slug;
  const total = scale.employees;
  const windowDays = daysBetween(from, to);

  // Four levels: one chief executive, a small executive tier, a manager tier,
  // and everyone else. Anything shallower cannot exercise a rollup report.
  const execCount = Math.max(1, Math.min(4, Math.round(total * 0.02)));
  const managerCount = Math.max(1, Math.round(total * 0.09));
  const levelOf = (index: number): number => {
    if (index === 0) return 0;
    if (index <= execCount) return 1;
    if (index <= execCount + managerCount) return 2;
    return 3;
  };

  /*
   * The status mix, laid out explicitly rather than drawn independently per
   * employee. A per-employee draw gives a mix that wobbles with the roster
   * size; an explicit ladder means "150 ACTIVE" is a fact of the fixture that a
   * spec can assert.
   */
  const leadershipCount = 1 + execCount + managerCount;
  const remainder = total - leadershipCount;
  const mix: EmployeeEmploymentStatus[] = [];
  const push = (status: EmployeeEmploymentStatus, share: number) => {
    for (let n = 0; n < Math.round(remainder * share); n += 1) mix.push(status);
  };
  push(EmployeeEmploymentStatus.PROBATION, 0.093);
  push(EmployeeEmploymentStatus.NOTICE, 0.047);
  push(EmployeeEmploymentStatus.TERMINATED, 0.209);
  push(EmployeeEmploymentStatus.INACTIVE, 0.07);
  while (mix.length < remainder) mix.push(EmployeeEmploymentStatus.ACTIVE);
  mix.length = remainder;

  const rows: EmployeeRow[] = [];
  for (let index = 0; index < total; index += 1) {
    const hierarchyLevel = levelOf(index);
    // Leadership is always ACTIVE; a terminated CEO makes every org-chart
    // report meaningless for a reason that has nothing to do with the report.
    const employmentStatus =
      hierarchyLevel < 3
        ? EmployeeEmploymentStatus.ACTIVE
        : mix[index - leadershipCount];

    let hireDate: Date;
    if (employmentStatus === EmployeeEmploymentStatus.PROBATION) {
      // Probation only makes sense for a recent hire.
      hireDate = addDays(to, -intBetween(10, 88, slug, 'hire-prob', index));
    } else if (hierarchyLevel < 2) {
      hireDate = addDays(
        from,
        -intBetween(200, 2200, slug, 'hire-exec', index),
      );
    } else if (chance(0.6, slug, 'hire-before-window', index)) {
      // Most of the roster predates the window, so headcount does not start
      // near zero and turnover has a denominator.
      hireDate = addDays(from, -intBetween(1, 1800, slug, 'hire-old', index));
    } else {
      hireDate = addDays(
        from,
        intBetween(0, windowDays - 1, slug, 'hire-new', index),
      );
    }

    let terminationDate: Date | null = null;
    if (employmentStatus === EmployeeEmploymentStatus.TERMINATED) {
      const earliest = hireDate > from ? hireDate : from;
      const span = Math.max(1, daysBetween(earliest, to));
      terminationDate = addDays(
        earliest,
        intBetween(Math.min(30, span), span, slug, 'termination', index),
      );
      if (terminationDate > to) terminationDate = to;
    } else if (employmentStatus === EmployeeEmploymentStatus.NOTICE) {
      // Serving notice: the last day is in the future, so this person still
      // counts in headcount today and will not tomorrow.
      terminationDate = addDays(to, intBetween(5, 60, slug, 'notice', index));
    }

    // The deliberate data-quality defects, so a data-quality report has true
    // positives to find rather than an empty result that reads as a pass.
    const missingDepartment =
      scale.injectDefects && hierarchyLevel === 3 && index % 47 === 11;
    const missingLocation =
      scale.injectDefects && hierarchyLevel === 3 && index % 41 === 7;
    const missingManager =
      scale.injectDefects && hierarchyLevel === 3 && index % 53 === 19;

    const deptSpec =
      deptSpecs[intBetween(0, deptSpecs.length - 1, slug, 'dept', index)];
    const departmentCode = missingDepartment ? null : deptSpec.code;
    const locationCode = missingLocation
      ? null
      : locationSpecs[
          intBetween(0, locationSpecs.length - 1, slug, 'loc', index)
        ].code;

    let managerId: string | null = null;
    if (!missingManager && hierarchyLevel === 1) {
      managerId = fixtureId(slug, 'employee', 0);
    } else if (!missingManager && hierarchyLevel === 2) {
      managerId = fixtureId(
        slug,
        'employee',
        intBetween(1, execCount, slug, 'manager-l2', index),
      );
    } else if (!missingManager && hierarchyLevel === 3) {
      managerId = fixtureId(
        slug,
        'employee',
        intBetween(
          execCount + 1,
          execCount + managerCount,
          slug,
          'manager-l3',
          index,
        ),
      );
    }

    const buCode =
      deptBuCodeByCode.get(deptSpec.code) ?? [...buIdByCode.keys()][0];

    rows.push({
      id: fixtureId(slug, 'employee', index),
      index,
      employeeCode: `${slug.slice(0, 3).toUpperCase()}-${String(1001 + index)}`,
      hireDate,
      terminationDate,
      employmentStatus,
      departmentCode,
      locationCode,
      managerId,
      hierarchyLevel,
      businessUnitId: buIdByCode.get(buCode)!,
    });
  }
  return rows;
}

/**
 * Which employees run the desktop agent.
 *
 * Spread across the roster rather than taken from the front, so the telemetry
 * population is not accidentally all leadership, all one department, or all
 * currently employed — a terminated employee whose device kept a history is a
 * real and awkward case for a retention-bounded report.
 */
function selectTelemetryEmployees(
  employees: EmployeeRow[],
  wanted: number,
): EmployeeRow[] {
  if (wanted >= employees.length) return [...employees];
  const stride = Math.max(1, Math.floor(employees.length / wanted));
  const selected: EmployeeRow[] = [];
  for (
    let index = 0;
    index < employees.length && selected.length < wanted;
    index += stride
  ) {
    selected.push(employees[index]);
  }
  return selected;
}

// ------------------------------------------------------------ derived values

/**
 * The numbers a metric spec will assert against, read back from the database
 * rather than predicted by the generator.
 *
 * Reading them back matters: a value the generator computed while writing is a
 * restatement of its own intent, and would agree with itself even if the write
 * were wrong. These are queries against what actually landed.
 */
async function deriveExpectedValues(
  prisma: Db,
  tenantId: string,
  from: Date,
  to: Date,
): Promise<Record<string, unknown>> {
  const last30From = addDays(to, -30);

  const activeHeadcountAtEnd = await prisma.employee.count({
    where: {
      tenantId,
      hireDate: { lte: to },
      OR: [{ terminationDate: null }, { terminationDate: { gt: to } }],
    },
  });
  const headcountByStatus = await prisma.employee.groupBy({
    by: ['employmentStatus'],
    where: { tenantId },
    _count: { _all: true },
  });
  const joinersLast30Days = await prisma.employee.count({
    where: { tenantId, hireDate: { gt: last30From, lte: to } },
  });
  const leaversLast30Days = await prisma.employee.count({
    where: { tenantId, terminationDate: { gt: last30From, lte: to } },
  });

  /*
   * Attendance rate.
   *
   * The denominator deliberately excludes PENDING, WEEKEND, HOLIDAY and OFF_DAY
   * rows. PENDING is the one that catches people out: those days have not been
   * reconciled, so counting them as "not present" understates every rate by
   * however far behind the engine is.
   */
  const excludedFromRate: AttendanceDayStatus[] = [
    AttendanceDayStatus.PENDING,
    AttendanceDayStatus.WEEKEND,
    AttendanceDayStatus.HOLIDAY,
    AttendanceDayStatus.OFF_DAY,
  ];
  const countedDays = await prisma.attendanceDay.count({
    where: { tenantId, status: { notIn: excludedFromRate } },
  });
  const presentDays = await prisma.attendanceDay.count({
    where: {
      tenantId,
      status: {
        in: [AttendanceDayStatus.PRESENT, AttendanceDayStatus.PARTIAL],
      },
    },
  });
  const pendingDays = await prisma.attendanceDay.count({
    where: { tenantId, status: AttendanceDayStatus.PENDING },
  });
  const attendanceTotals = await prisma.attendanceDay.aggregate({
    where: { tenantId, status: { notIn: excludedFromRate } },
    _sum: {
      scheduledMinutes: true,
      workedMinutes: true,
      lateMinutes: true,
      extraMinutes: true,
    },
  });
  const lateDays = await prisma.attendanceDay.count({
    where: { tenantId, lateMinutes: { gt: 0 } },
  });

  const approvedLeave = await prisma.leaveRequest.aggregate({
    where: { tenantId, status: LeaveRequestStatus.APPROVED },
    _sum: { totalDays: true },
    _count: { _all: true },
  });
  const leaveByStatus = await prisma.leaveRequest.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: { _all: true },
  });

  const applicationsByStage = await prisma.application.groupBy({
    by: ['stage'],
    where: { tenantId },
    _count: { _all: true },
  });
  const reachedInterview = await prisma.applicationStageHistory.findMany({
    where: { tenantId, toStage: RecruitmentStage.INTERVIEW },
    select: { applicationId: true },
    distinct: ['applicationId'],
  });
  const hiredApplications = await prisma.application.count({
    where: { tenantId, stage: RecruitmentStage.HIRED },
  });

  const devices = await prisma.employeeDevice.count({ where: { tenantId } });
  const staleDevices = await prisma.employeeDevice.count({
    where: { tenantId, lastSeenAt: { lt: addDays(to, -14) } },
  });
  const outdatedAgents = await prisma.employeeDevice.count({
    where: { tenantId, agentVersion: OUTDATED_AGENT_VERSION },
  });
  const orphanedSessions = await prisma.workSession.count({
    where: { tenantId, endedAt: null },
  });
  const employeesWithDevice = await prisma.employeeDevice.findMany({
    where: { tenantId },
    select: { employeeId: true },
    distinct: ['employeeId'],
  });
  const totalEmployees = await prisma.employee.count({ where: { tenantId } });
  const productivity = await prisma.dailyProductivitySummary.aggregate({
    where: { tenantId },
    _sum: {
      activeSeconds: true,
      idleSeconds: true,
      awaySeconds: true,
      loggedInSeconds: true,
    },
    _count: { _all: true },
  });

  const withoutDepartment = await prisma.employee.count({
    where: { tenantId, departmentId: null },
  });
  const withoutLocation = await prisma.employee.count({
    where: { tenantId, locationId: null },
  });
  const withoutManager = await prisma.employee.count({
    where: { tenantId, managerEmployeeId: null },
  });

  const activeSeconds = productivity._sum.activeSeconds ?? 0;
  const loggedInSeconds = productivity._sum.loggedInSeconds ?? 0;

  return {
    window: { from: isoDay(from), to: isoDay(to) },
    workforce: {
      totalEmployeeRecords: totalEmployees,
      activeHeadcountAtEndDate: activeHeadcountAtEnd,
      headcountByEmploymentStatus: Object.fromEntries(
        headcountByStatus.map((row) => [row.employmentStatus, row._count._all]),
      ),
      joinersLast30Days,
      leaversLast30Days,
      // The classic turnover formula: leavers over average headcount. Reported
      // as its parts too, because the parts are what a spec should assert.
      turnoverRateLast30DaysPercent: Number(
        ((leaversLast30Days / Math.max(1, activeHeadcountAtEnd)) * 100).toFixed(
          4,
        ),
      ),
    },
    attendance: {
      countedDays,
      presentOrPartialDays: presentDays,
      pendingDaysExcludedFromDenominator: pendingDays,
      attendanceRatePercent: Number(
        ((presentDays / Math.max(1, countedDays)) * 100).toFixed(4),
      ),
      scheduledMinutes: attendanceTotals._sum.scheduledMinutes ?? 0,
      workedMinutes: attendanceTotals._sum.workedMinutes ?? 0,
      lateMinutes: attendanceTotals._sum.lateMinutes ?? 0,
      extraMinutes: attendanceTotals._sum.extraMinutes ?? 0,
      daysWithLateness: lateDays,
    },
    leave: {
      approvedRequests: approvedLeave._count._all,
      approvedLeaveDays: Number(approvedLeave._sum.totalDays ?? 0),
      requestsByStatus: Object.fromEntries(
        leaveByStatus.map((row) => [row.status, row._count._all]),
      ),
    },
    recruitment: {
      applicationsByStage: Object.fromEntries(
        applicationsByStage.map((row) => [row.stage, row._count._all]),
      ),
      applicationsThatEverReachedInterview: reachedInterview.length,
      hiredApplications,
    },
    desktop: {
      devices,
      devicesNotSeenIn14Days: staleDevices,
      devicesOnOutdatedAgent: outdatedAgents,
      orphanedSessionsWithNoEnd: orphanedSessions,
      employeesWithADevice: employeesWithDevice.length,
      employeesWithNoDevice: totalEmployees - employeesWithDevice.length,
      productivityDays: productivity._count._all,
      // Re-derived as SUM/SUM. Averaging a per-day percentage across employees
      // weights a two-hour day the same as a nine-hour one.
      utilizationPercentSumOverSum: Number(
        ((activeSeconds / Math.max(1, loggedInSeconds)) * 100).toFixed(4),
      ),
    },
    dataQuality: {
      employeesWithoutDepartment: withoutDepartment,
      employeesWithoutLocation: withoutLocation,
      // Includes the chief executive, who legitimately has none.
      employeesWithoutManager: withoutManager,
    },
  };
}

// ----------------------------------------------------------------------- main

export async function runAnalyticsFixtureSeed(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return;
  }

  const options = parseCli(argv);

  // Both safety checks run to completion before a single row is written.
  const target = assertDisposableDatabase();
  if (!options.confirm) {
    console.error(
      'REFUSED — this generator writes tens of thousands of rows.\n' +
        'Re-run with --confirm once you are sure of the target database.',
    );
    process.exit(1);
  }

  const prisma = createPrismaClient();
  try {
    const holidays = buildHolidaySet(options.from, options.to);
    console.log(
      `Seeding analytics fixture into ${target} for ${isoDay(options.from)} → ${isoDay(options.to)}…`,
    );

    const main = await seedTenant(
      prisma,
      { ...MAIN_SCALE, slug: options.tenantSlug, name: 'Analytics Fixture Co' },
      options.from,
      options.to,
      holidays,
    );
    console.log(`  main tenant "${options.tenantSlug}" written.`);

    const secondary = await seedTenant(
      prisma,
      {
        ...SECONDARY_SCALE,
        slug: options.secondarySlug,
        name: 'Analytics Fixture Rival Co',
      },
      options.from,
      options.to,
      holidays,
    );
    console.log(`  isolation tenant "${options.secondarySlug}" written.`);

    const expected = await deriveExpectedValues(
      prisma,
      main.tenantId,
      options.from,
      options.to,
    );

    console.log(
      JSON.stringify(
        {
          message: 'Analytics fixture seed completed successfully.',
          seed: FIXTURE_SEED,
          window: { from: isoDay(options.from), to: isoDay(options.to) },
          tenants: {
            main: {
              slug: options.tenantSlug,
              tenantId: main.tenantId,
              counts: main.counts,
            },
            // Its rows must never appear in the main tenant's reports. That is
            // the whole reason it exists.
            isolationProbe: {
              slug: options.secondarySlug,
              tenantId: secondary.tenantId,
              counts: secondary.counts,
            },
          },
          expectedValues: expected,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runAnalyticsFixtureSeed(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
