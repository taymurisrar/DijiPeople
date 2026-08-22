/*
 * Ownership registry for resources a test run brings into existence.
 *
 * The rule this implements is that a test creates what it asserts on, and cleans
 * exactly what it created — no more, and never by broad match. Everything here
 * follows from registering a resource at the moment it is created rather than
 * reconstructing ownership at teardown, because a teardown that has to *work
 * out* what it owns is one that will eventually delete something it does not.
 *
 * Three failures are designed out specifically.
 *
 *   Partial setup. Setup throws on step three, teardown runs against undefined
 *   ids, and the suite reports a second misleading error that buries the first.
 *   Registering per-resource means teardown sees exactly the two things that
 *   were made, not the six the fixture intended.
 *
 *   Swallowed cleanup failure. `try {} catch {}` around teardown turns a leaked
 *   tenant into a green suite. Failures land in the accounting instead, and a
 *   run that leaked cannot report a clean summary.
 *
 *   False terminal status. A provider object that cannot be deleted is
 *   ARCHIVED_PROVIDER_LIMITATION, never CLEANED. An honest limitation is worth
 *   more than a tidy lie, because the next run trusts what this one recorded.
 *
 * Deliberately dependency-free and storage-free: it holds the registry in
 * memory for the life of a run and hands back a summary. Persisting that summary
 * is the caller's business — a QA run record, a CI artefact — because the shape
 * of the store differs per suite and this file should not care.
 */

/** What cleanup will attempt for a resource. */
export const CLEANUP_STRATEGIES = ['delete', 'cancel', 'archive', 'drop-database', 'none'];

/**
 * Terminal state of one resource.
 *
 * RETAINED_AS_EVIDENCE is not a failure to clean — it is a deliberate decision
 * that the artefact outlives the run. ARCHIVED_PROVIDER_LIMITATION is the honest
 * outcome when a provider will not let go of an object.
 */
export const CLEANUP_STATUSES = [
  'PENDING',
  'CLEANED',
  'RETAINED_AS_EVIDENCE',
  'FAILED',
  'ARCHIVED_PROVIDER_LIMITATION',
];

/**
 * Resources that are evidence rather than state. Cleaning these would destroy
 * the proof the run exists to produce.
 */
export const EVIDENCE_TYPES = new Set([
  'screenshot',
  'trace',
  'video',
  'test-report',
  'failure-log',
  'qa-run-record',
  'regression-record',
]);

/**
 * A registry for one test run.
 *
 *   const registry = createRegistry('DB-E2E-2026-08-21-01');
 *   const tenant = registry.register({ type: 'tenant', id: t.id, cleanup: 'delete' });
 *   ...
 *   await registry.cleanup(async (resource) => { ... });
 *   const summary = registry.summary();
 */
export function createRegistry(runId, { owner = '' } = {}) {
  if (!runId) throw new Error('createRegistry requires a runId — an unowned registry cannot be reconciled');

  const resources = [];

  /**
   * Record a resource the moment it exists.
   *
   * Call this immediately after creation, never in a batch at the end of setup:
   * the batch is exactly what a half-failed setup never reaches.
   */
  function register({ type, id, cleanup = 'delete', owner: resourceOwner = owner, note = '' } = {}) {
    if (!type) throw new Error('register requires a type');
    if (id === undefined || id === null || id === '') {
      throw new Error(`register requires an id for ${type} — an unidentified resource cannot be cleaned`);
    }
    if (!CLEANUP_STRATEGIES.includes(cleanup)) {
      throw new Error(`unknown cleanup strategy "${cleanup}" for ${type}`);
    }

    const resource = {
      runId,
      owner: resourceOwner,
      type,
      id: String(id),
      cleanup: EVIDENCE_TYPES.has(type) ? 'none' : cleanup,
      note,
      createdAt: new Date().toISOString(),
      status: EVIDENCE_TYPES.has(type) ? 'RETAINED_AS_EVIDENCE' : 'PENDING',
      error: '',
    };

    resources.push(resource);
    return resource;
  }

  /**
   * Clean every owned resource, most recent first.
   *
   * Reverse order because resources are usually created in dependency order —
   * tenant, then business unit, then employee — and deleting the tenant first
   * turns every later deletion into a cascade or a foreign-key error.
   *
   * A handler that throws marks that one resource FAILED and cleanup continues.
   * Stopping at the first failure is how one stuck provider object leaves twenty
   * database rows behind.
   */
  async function cleanup(handler) {
    if (typeof handler !== 'function') throw new Error('cleanup requires a handler');

    for (const resource of [...resources].reverse()) {
      if (resource.status !== 'PENDING') continue;
      if (resource.cleanup === 'none') {
        resource.status = 'RETAINED_AS_EVIDENCE';
        continue;
      }

      try {
        const outcome = await handler(resource);
        /*
         * A handler may report that the provider would not delete the object.
         * That is a legitimate terminal state and must not be recorded as
         * CLEANED — the object is still out there.
         */
        if (outcome && CLEANUP_STATUSES.includes(outcome)) {
          resource.status = outcome;
        } else {
          resource.status = 'CLEANED';
        }
      } catch (error) {
        resource.status = 'FAILED';
        resource.error = String(error?.message ?? error).split('\n')[0];
      }
    }

    return summary();
  }

  /**
   * The five numbers a run closes with.
   *
   * `unaccounted` is the one that cannot be argued down. A resource still
   * PENDING after cleanup was created and then neither cleaned, retained nor
   * recorded as failed — so unlike a failure it leaves nothing to follow.
   */
  function summary() {
    const count = (status) => resources.filter((resource) => resource.status === status).length;

    const failures = resources.filter((resource) => resource.status === 'FAILED');
    const unaccounted = resources.filter((resource) => resource.status === 'PENDING');

    return {
      runId,
      TEST_RESOURCES_CREATED: resources.length,
      TEST_RESOURCES_CLEANED: count('CLEANED'),
      TEST_RESOURCES_RETAINED_AS_EVIDENCE: count('RETAINED_AS_EVIDENCE'),
      TEST_RESOURCES_ARCHIVED_PROVIDER_LIMITATION: count('ARCHIVED_PROVIDER_LIMITATION'),
      TEST_RESOURCE_CLEANUP_FAILURES: failures.length,
      UNACCOUNTED_TEST_RESOURCES: unaccounted.length,
      failures: failures.map((resource) => `${resource.type}:${resource.id} — ${resource.error}`),
      unaccounted: unaccounted.map((resource) => `${resource.type}:${resource.id}`),
      resources,
    };
  }

  /**
   * Whether a QA verdict may be PASS.
   *
   * Separated from `summary` so the condition is stated once and cannot drift
   * between the suites that check it. A leak is a failed run even when every
   * assertion passed: the next run inherits the mess and fails for reasons that
   * have nothing to do with the code under test.
   */
  function mayPass() {
    const state = summary();
    const reasons = [];
    if (state.TEST_RESOURCE_CLEANUP_FAILURES > 0) {
      reasons.push(`${state.TEST_RESOURCE_CLEANUP_FAILURES} owned resource(s) failed to clean`);
    }
    if (state.UNACCOUNTED_TEST_RESOURCES > 0) {
      reasons.push(`${state.UNACCOUNTED_TEST_RESOURCES} resource(s) unaccounted for`);
    }
    return { ok: reasons.length === 0, reasons };
  }

  return { runId, register, cleanup, summary, mayPass, resources };
}

/**
 * Format a summary for a QA run record.
 *
 * Kept here rather than in each suite so every run reports the same five fields
 * under the same names — the Control Center and the completion contract both
 * read them.
 */
export function formatSummary(summary) {
  return [
    `TEST_RESOURCES_CREATED              ${summary.TEST_RESOURCES_CREATED}`,
    `TEST_RESOURCES_CLEANED              ${summary.TEST_RESOURCES_CLEANED}`,
    `TEST_RESOURCES_RETAINED_AS_EVIDENCE ${summary.TEST_RESOURCES_RETAINED_AS_EVIDENCE}`,
    `TEST_RESOURCE_CLEANUP_FAILURES      ${summary.TEST_RESOURCE_CLEANUP_FAILURES}`,
    `UNACCOUNTED_TEST_RESOURCES          ${summary.UNACCOUNTED_TEST_RESOURCES}`,
  ].join('\n');
}
