/*
 * Durable QA test plans and reusable test scenarios.
 *
 * QA in this repository has been rebuilt from zero on every task. A run file
 * records what somebody tested once; nothing recorded what should *always* be
 * tested for an area, so the next agent designed its scenarios again, missed the
 * ones the previous agent had found the hard way, and the regression register
 * was the only thing carrying memory forward.
 *
 * Two record types fix that:
 *
 *   **A test plan** is per product area and evergreen. It states scope, risks,
 *   the cases that must always be covered, and — declared explicitly, not
 *   inferred — how good the coverage currently is on each dimension.
 *
 *   **A scenario** is one reusable, id'd test with steps and an expected result.
 *   It outlives the run that invented it, so "the tenant-isolation case for
 *   error logs" is a thing that can be selected and re-run rather than a thing
 *   somebody has to think of again.
 *
 * The cross-checks below are what stop this becoming filing. A plan may claim
 * `COVERAGE_SECURITY: GOOD`; if it has no security scenarios, or its automated
 * scenarios point at test files that do not exist, the claim fails validation.
 * That is the `declared-but-unwired-step` bug pattern applied to QA's own
 * records, and it is exactly the failure a coverage matrix invites.
 *
 * Same flat frontmatter dialect as every other record system here.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { allocateId } from './id-allocator.mjs';
import {
  recordFilesIn,
  splitFrontmatter,
  parseFrontmatter,
  writeIfChanged,
  slugify,
} from './backlog-records.mjs';

export { writeIfChanged, slugify };

export const PLAN_DIR = 'docs/qa/test-plans';
export const SCENARIO_DIR = 'docs/qa/scenarios';

/** What a scenario proves. Kept identical to the table in `.agent/agents/qa.md`. */
export const SCENARIO_TYPES = [
  'UNIT',
  'API',
  'DATABASE',
  'INTEGRATION',
  'E2E',
  'BROWSER_E2E',
  'SECURITY',
  'PERFORMANCE',
  'MANUAL_VISUAL',
  'DEPLOYMENT_SMOKE',
];

export const RISKS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/**
 * How a scenario runs today.
 *
 * `BLOCKED_INFRASTRUCTURE` is a first-class value rather than an omission: this
 * repository has no browser automation and no always-available database, and a
 * scenario that silently disappears because it cannot run is how a coverage
 * matrix comes to describe a system nobody tests.
 */
export const AUTOMATION_STATUSES = ['AUTOMATED', 'PARTIAL', 'MANUAL', 'BLOCKED_INFRASTRUCTURE'];

export const RESULTS = ['PASS', 'PASS_WITH_RISKS', 'FAIL', 'BLOCKED', 'NOT_RUN'];

export const PLAN_STATUSES = ['CURRENT', 'NEEDS_REVIEW', 'DRAFT'];

/** Coverage dimensions, and the scenario type that evidences each. */
export const COVERAGE_DIMENSIONS = {
  UNIT: 'UNIT',
  API: 'API',
  DATABASE: 'DATABASE',
  INTEGRATION: 'INTEGRATION',
  E2E: 'E2E',
  BROWSER: 'BROWSER_E2E',
  SECURITY: 'SECURITY',
  PERFORMANCE: 'PERFORMANCE',
};

export const COVERAGE_STATUSES = ['GOOD', 'PARTIAL', 'GAP', 'NOT_APPLICABLE'];

export const PLAN_REQUIRED_FIELDS = [
  'PLAN_ID',
  'TITLE',
  'AREA',
  'STATUS',
  'MODULES',
  'RISK',
  'RELATED_BUGS',
  'RELATED_REGRESSIONS',
  'CREATED_AT',
  'UPDATED_AT',
  'VERIFIED_AGAINST_SHA',
  ...Object.keys(COVERAGE_DIMENSIONS).map((dimension) => `COVERAGE_${dimension}`),
];

export const PLAN_SECTIONS = [
  'Scope',
  'Risks',
  'Preconditions',
  'Test Types',
  'Data Requirements',
  'Security Cases',
  'Negative Cases',
  'State Transitions',
  'Integration Cases',
  'Browser Cases',
  'Regression Links',
];

export const SCENARIO_REQUIRED_FIELDS = [
  'SCENARIO_ID',
  'TITLE',
  'AREA',
  'MODULE',
  'TYPE',
  'RISK',
  'AUTOMATION_STATUS',
  'TEST_REFERENCE',
  'RELATED_BUGS',
  'RELATED_REGRESSIONS',
  'LAST_RUN',
  'LAST_RESULT',
  'CREATED_AT',
  'UPDATED_AT',
];

export const SCENARIO_SECTIONS = ['Preconditions', 'Steps', 'Expected Result', 'Notes'];

const GENERATED = ['README.md', 'index.md'];

function asList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function enumCheck(errors, where, field, value, allowed, { optional = false } = {}) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    if (!optional) errors.push(`${where}: ${field} is empty`);
    return;
  }
  if (!allowed.includes(trimmed)) {
    errors.push(`${where}: ${field} = "${trimmed}" is not one of ${allowed.join(' | ')}`);
  }
}

function parseRecords(root, dir, kind) {
  const records = [];
  const errors = [];

  for (const file of recordFilesIn(root, dir)) {
    if (GENERATED.includes(file.name)) continue;

    let text;
    try {
      text = readFileSync(file.path, 'utf8');
    } catch (error) {
      errors.push(`${file.relative}: unreadable — ${error.message}`);
      continue;
    }

    const split = splitFrontmatter(text);
    if (!split) {
      errors.push(`${file.relative}: no --- frontmatter block`);
      continue;
    }

    const { fields, errors: parseErrors } = parseFrontmatter(split.raw);
    for (const message of parseErrors) errors.push(`${file.relative}: ${message}`);

    records.push({ kind, fields, body: split.body, relative: file.relative, path: file.path });
  }

  return { records, errors };
}

/**
 * Load every plan and scenario, validated and cross-checked.
 *
 * Never throws — structural problems come back in `errors` so the caller
 * decides the exit code, exactly as `loadRecords` does for bugs and backlog.
 */
export function loadQaRecords(root, { knownRecordIds = null } = {}) {
  const errors = [];

  const { records: rawPlans, errors: planErrors } = parseRecords(root, PLAN_DIR, 'plan');
  const { records: rawScenarios, errors: scenarioErrors } = parseRecords(root, SCENARIO_DIR, 'scenario');
  errors.push(...planErrors, ...scenarioErrors);

  const plans = rawPlans.map((record) => {
    const { fields, relative } = record;
    for (const field of PLAN_REQUIRED_FIELDS) {
      if (!(field in fields)) errors.push(`${relative}: missing required field ${field}`);
    }

    const id = String(fields.PLAN_ID ?? '').trim();
    if (id && !/^PLAN-\d{3}$/.test(id)) errors.push(`${relative}: PLAN_ID "${id}" does not match PLAN-nnn`);
    if (id && !basename(relative).startsWith(`${id}-`)) {
      errors.push(`${relative}: filename must start with "${id}-" so the id and the file cannot drift`);
    }

    enumCheck(errors, relative, 'STATUS', fields.STATUS, PLAN_STATUSES);
    enumCheck(errors, relative, 'RISK', fields.RISK, RISKS);

    const coverage = {};
    for (const dimension of Object.keys(COVERAGE_DIMENSIONS)) {
      const key = `COVERAGE_${dimension}`;
      enumCheck(errors, relative, key, fields[key], COVERAGE_STATUSES);
      coverage[dimension] = String(fields[key] ?? '').trim();
    }

    for (const section of PLAN_SECTIONS) {
      if (!new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(record.body)) {
        errors.push(`${relative}: missing required section "## ${section}"`);
      }
    }

    return {
      ...record,
      id,
      title: String(fields.TITLE ?? '').trim(),
      area: String(fields.AREA ?? '').trim(),
      status: String(fields.STATUS ?? '').trim(),
      risk: String(fields.RISK ?? '').trim(),
      modules: asList(fields.MODULES),
      bugs: asList(fields.RELATED_BUGS),
      regressions: asList(fields.RELATED_REGRESSIONS),
      updatedAt: String(fields.UPDATED_AT ?? '').trim(),
      verifiedAgainstSha: String(fields.VERIFIED_AGAINST_SHA ?? '').trim(),
      coverage,
    };
  });

  const scenarios = rawScenarios.map((record) => {
    const { fields, relative } = record;
    for (const field of SCENARIO_REQUIRED_FIELDS) {
      if (!(field in fields)) errors.push(`${relative}: missing required field ${field}`);
    }

    const id = String(fields.SCENARIO_ID ?? '').trim();
    if (id && !/^QA-[A-Z0-9]+-\d{3}$/.test(id)) {
      errors.push(`${relative}: SCENARIO_ID "${id}" does not match QA-<SCOPE>-nnn`);
    }
    if (id && !basename(relative).startsWith(`${id}-`)) {
      errors.push(`${relative}: filename must start with "${id}-" so the id and the file cannot drift`);
    }

    enumCheck(errors, relative, 'TYPE', fields.TYPE, SCENARIO_TYPES);
    enumCheck(errors, relative, 'RISK', fields.RISK, RISKS);
    enumCheck(errors, relative, 'AUTOMATION_STATUS', fields.AUTOMATION_STATUS, AUTOMATION_STATUSES);
    enumCheck(errors, relative, 'LAST_RESULT', fields.LAST_RESULT, RESULTS);

    for (const section of SCENARIO_SECTIONS) {
      if (!new RegExp(`^##\\s+${section}\\s*$`, 'm').test(record.body)) {
        errors.push(`${relative}: missing required section "## ${section}"`);
      }
    }

    const automation = String(fields.AUTOMATION_STATUS ?? '').trim();
    const reference = String(fields.TEST_REFERENCE ?? '').trim();

    /*
     * The check that makes AUTOMATION_STATUS mean something.
     *
     * A scenario claiming to be AUTOMATED while naming a test file that does not
     * exist is the `declared-but-unwired-step` pattern pointed at QA's own
     * records — and it is worse than an untested scenario, because the coverage
     * matrix then reports coverage nobody has.
     */
    if (['AUTOMATED', 'PARTIAL'].includes(automation)) {
      if (!reference) {
        errors.push(`${relative}: AUTOMATION_STATUS ${automation} requires a TEST_REFERENCE`);
      } else {
        for (const candidate of reference.split(/\s+/).filter(Boolean)) {
          if (!existsSync(join(root, candidate))) {
            errors.push(
              `${relative}: TEST_REFERENCE "${candidate}" does not exist — ` +
                'an automated scenario pointing at a missing test reports coverage that is not there',
            );
          }
        }
      }
    }

    return {
      ...record,
      id,
      title: String(fields.TITLE ?? '').trim(),
      area: String(fields.AREA ?? '').trim(),
      module: String(fields.MODULE ?? '').trim(),
      type: String(fields.TYPE ?? '').trim(),
      risk: String(fields.RISK ?? '').trim(),
      automation,
      testReference: reference,
      bugs: asList(fields.RELATED_BUGS),
      regressions: asList(fields.RELATED_REGRESSIONS),
      lastRun: String(fields.LAST_RUN ?? '').trim(),
      lastResult: String(fields.LAST_RESULT ?? '').trim(),
      updatedAt: String(fields.UPDATED_AT ?? '').trim(),
    };
  });

  /* Duplicate ids, in both directions. */
  for (const [label, group] of [['plan', plans], ['scenario', scenarios]]) {
    const seen = new Map();
    for (const record of group) {
      if (!record.id) continue;
      if (seen.has(record.id)) {
        errors.push(`duplicate ${label} id ${record.id}: ${seen.get(record.id)} and ${record.relative}`);
      } else {
        seen.set(record.id, record.relative);
      }
    }
  }

  /* A scenario belonging to no plan is a scenario nobody selects. */
  const areas = new Set(plans.map((plan) => plan.area).filter(Boolean));
  for (const scenario of scenarios) {
    if (scenario.area && !areas.has(scenario.area)) {
      errors.push(
        `${scenario.relative}: AREA "${scenario.area}" has no test plan — ` +
          'a scenario outside every plan is never selected for a re-run',
      );
    }
  }

  /* Declared coverage must be evidenced by scenarios that can actually run. */
  const byArea = new Map();
  for (const scenario of scenarios) {
    if (!byArea.has(scenario.area)) byArea.set(scenario.area, []);
    byArea.get(scenario.area).push(scenario);
  }

  for (const plan of plans) {
    const owned = byArea.get(plan.area) ?? [];
    for (const [dimension, scenarioType] of Object.entries(COVERAGE_DIMENSIONS)) {
      const declared = plan.coverage[dimension];
      if (!['GOOD', 'PARTIAL'].includes(declared)) continue;

      const matching = owned.filter((scenario) => scenario.type === scenarioType);
      if (!matching.length) {
        errors.push(
          `${plan.relative}: COVERAGE_${dimension} = ${declared} but no ${scenarioType} scenario exists for area "${plan.area}"`,
        );
        continue;
      }
      if (declared === 'GOOD' && matching.every((scenario) => scenario.automation === 'BLOCKED_INFRASTRUCTURE')) {
        errors.push(
          `${plan.relative}: COVERAGE_${dimension} = GOOD but every ${scenarioType} scenario is BLOCKED_INFRASTRUCTURE — ` +
            'coverage that cannot run is a GAP, and calling it GOOD is how a matrix stops being evidence',
        );
      }
    }
  }

  /* Cross-references must resolve, or the links are decoration. */
  if (knownRecordIds) {
    for (const record of [...plans, ...scenarios]) {
      for (const reference of record.bugs) {
        if (!/^(BUG|ITEM)-\d{4}$/.test(reference)) continue;
        if (!knownRecordIds.has(reference)) {
          errors.push(`${record.relative}: RELATED_BUGS references unknown record ${reference}`);
        }
      }
    }
  }

  const registerPath = join(root, 'docs/qa/regressions/index.md');
  if (existsSync(registerPath)) {
    const register = readFileSync(registerPath, 'utf8');
    for (const record of [...plans, ...scenarios]) {
      for (const reference of record.regressions) {
        if (!/^REG-\d{3}$/.test(reference)) continue;
        if (!register.includes(reference)) {
          errors.push(`${record.relative}: RELATED_REGRESSIONS references ${reference}, absent from the register`);
        }
      }
    }
  }

  return { plans, scenarios, errors };
}

// ------------------------------------------------------------------ selection

/**
 * Which durable QA material applies to a change.
 *
 * This is `QA re-run behaviour` expressed as a function: given the modules a
 * task touched, return the plans, scenarios and regressions to load *before*
 * designing anything new. QA that starts from a blank page rediscovers the
 * cheap cases and misses the expensive ones.
 *
 * Matching is on module-path prefix in either direction, so
 * `services/api/src/modules/auth` selects scenarios recorded against
 * `services/api/src/modules/auth/auth.service.ts` and vice versa.
 */
export function selectForModules(records, modules) {
  const wanted = modules.map((module) => String(module).replace(/\\/g, '/').replace(/^\.\//, ''));

  const touches = (recorded) => {
    const value = String(recorded ?? '').replace(/\\/g, '/');
    if (!value) return false;
    return wanted.some((module) => value.startsWith(module) || module.startsWith(value));
  };

  const plans = records.plans.filter(
    (plan) => plan.modules.some(touches) || wanted.some((module) => module.includes(plan.area)),
  );
  const areas = new Set(plans.map((plan) => plan.area));

  const scenarios = records.scenarios.filter(
    (scenario) => touches(scenario.module) || areas.has(scenario.area),
  );

  return {
    plans,
    scenarios,
    /*
     * Mandatory scenarios are surfaced separately rather than left for the
     * reader to notice. Security and tenant-isolation failures are silent — the
     * product looks fine until somebody outside the team finds them — so they
     * are never risk-weighted down.
     */
    mandatory: scenarios.filter(
      (scenario) => scenario.type === 'SECURITY' || scenario.risk === 'CRITICAL',
    ),
    regressions: [...new Set(scenarios.flatMap((scenario) => scenario.regressions))].sort(),
    bugs: [...new Set(scenarios.flatMap((scenario) => scenario.bugs))].sort(),
  };
}

// --------------------------------------------------------------- allocation

export function nextPlanId(root, { note = '' } = {}) {
  return allocateId(root, 'plan', { note });
}

export function nextScenarioId(root, scope, { note = '' } = {}) {
  return allocateId(root, 'scenario', { scope, note });
}

export const GENERATED_BANNER =
  '> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-qa.mjs`.';
