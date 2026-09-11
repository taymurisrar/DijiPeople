#!/usr/bin/env node
/*
 * ITEM-0084 — detect drift between render.yaml and the live Render service.
 *
 *   node scripts/check-render-config.mjs             human-readable
 *   node scripts/check-render-config.mjs --json       machine-readable
 *   node scripts/check-render-config.mjs --root <dir> a different checkout
 *
 * BUG-0767 was that the live service did not match render.yaml at all: no
 * preDeployCommand, and `prisma migrate deploy` bolted onto the build command
 * instead. Someone made them agree by hand. Nothing has stopped them
 * diverging again since — the file is committed and reviewed, the service is
 * edited in a dashboard, and a Render deploy captures env vars when the
 * service is CREATED, not at container start, so the two are structurally
 * guaranteed to drift apart over time.
 *
 * This script reports the drift; it never writes to Render. It:
 *
 *   1. Compares the scalar fields render.yaml declares for the API service
 *      (name, plan, buildCommand, startCommand, preDeployCommand,
 *      healthCheckPath) against what the live service actually runs.
 *   2. Reports env var keys render.yaml declares that do not exist on the
 *      live service at all — the exact shape of BUG-0767's root cause, and
 *      the single most consequential kind of drift this file can have,
 *      because a missing key silently changes application behaviour rather
 *      than failing a deploy.
 *   3. Compares the literal `value:` render.yaml assigns a key (not
 *      `sync: false` ones, which are deliberately dashboard-owned) against
 *      the live value.
 *
 * It deliberately does NOT fail the build over `autoDeploy` or `branch` —
 * render.yaml does not declare either for this service, so there is no
 * expectation on file to compare against. They are reported as informational
 * context only.
 *
 * NODE_OPTIONS memory caps are a case the item names explicitly: they are set
 * on the live buildCommand/preDeployCommand deliberately and are not in the
 * file. A silent allowance would be a hole (the item's own words), so a
 * NODE_OPTIONS prefix difference is still SHOWN, just under its own heading
 * rather than folded into "drift" — visible, not swallowed.
 *
 * This is intentionally a small hand-rolled render.yaml reader, not a real
 * YAML parser: the file has exactly one service with a flat scalar block and
 * one `envVars` list, and adding a YAML dependency for one file the repo
 * already treats as append-only structured comments was not justified. If
 * render.yaml grows a second service or nested structure, this parser must be
 * replaced, and it will fail loudly (rather than silently mis-reading) if the
 * `services:` shape does not match what it expects.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DEFAULT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RENDER_API = 'https://api.render.com/v1';

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? '' : (argv[index + 1] ?? '');
}

/** Read the one service block render.yaml declares. Throws loudly on a shape
 * this parser does not understand rather than guessing. */
export function readRenderYaml(root) {
  const path = join(root, 'render.yaml');
  if (!existsSync(path)) {
    throw new Error(`render.yaml not found at ${path}`);
  }
  const body = readFileSync(path, 'utf8');
  const lines = body.split(/\r?\n/);

  const serviceHeaders = lines.filter((line) => /^\s*-\s*type:\s*\S+/.test(line));
  if (serviceHeaders.length !== 1) {
    throw new Error(
      `expected exactly one service in render.yaml, found ${serviceHeaders.length} — this parser only understands a single-service file`,
    );
  }

  const scalars = {};
  for (const key of [
    'name',
    'env',
    'plan',
    'buildCommand',
    'startCommand',
    'preDeployCommand',
    'healthCheckPath',
  ]) {
    const match = body.match(new RegExp(`^\\s{4}${key}:\\s*(.+)$`, 'm'));
    scalars[key] = match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
  }

  // envVars: block is indented `      - key: X` with `value:`/`sync:` on the
  // following one or two lines at the same nesting.
  const envVarsIndex = lines.findIndex((line) => /^\s{4}envVars:\s*$/.test(line));
  const envVars = [];
  if (envVarsIndex !== -1) {
    let current = null;
    for (let i = envVarsIndex + 1; i < lines.length; i += 1) {
      const line = lines[i];
      // A dedent back to 4-space (service-level) or 2-space (top-level) ends
      // the envVars list.
      if (/^\s{0,4}\S/.test(line) && !/^\s{6,}/.test(line)) break;
      const keyMatch = line.match(/^\s{6}-\s*key:\s*(\S+)\s*$/);
      if (keyMatch) {
        if (current) envVars.push(current);
        current = { key: keyMatch[1], value: undefined, sync: undefined };
        continue;
      }
      if (!current) continue;
      const valueMatch = line.match(/^\s{8}value:\s*(.*)$/);
      if (valueMatch) {
        current.value = valueMatch[1].trim().replace(/^["']|["']$/g, '');
        continue;
      }
      const syncMatch = line.match(/^\s{8}sync:\s*(\S+)\s*$/);
      if (syncMatch) {
        current.sync = syncMatch[1] === 'true';
      }
    }
    if (current) envVars.push(current);
  }

  return { scalars, envVars };
}

async function renderApiFetch(apiKey, path, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${RENDER_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Render API ${path} → ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/** The live service matching this repository's API service — matched by repo
 * URL and rootDir, never by name, because the name is one of the fields this
 * script must be free to report as drifted. */
export async function findLiveService(apiKey, { fetchImpl } = {}) {
  const page = await renderApiFetch(apiKey, '/services?limit=100', { fetchImpl });
  const services = page.map((entry) => entry.service);
  const candidates = services.filter(
    (s) => s.rootDir === 'services/api' && /DijiPeople/i.test(s.repo ?? ''),
  );
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error(
      `${candidates.length} live services match services/api in a DijiPeople repo — cannot pick one automatically. Set RENDER_SERVICE_ID.`,
    );
  }
  if (services.length === 1) return services[0];
  throw new Error(
    'could not identify the live API service by rootDir/repo, and more than one service exists on this account. Set RENDER_SERVICE_ID.',
  );
}

export async function fetchLiveEnvVars(apiKey, serviceId, { fetchImpl } = {}) {
  const results = [];
  let cursor = '';
  for (;;) {
    const qs = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const page = await renderApiFetch(
      apiKey,
      `/services/${serviceId}/env-vars?limit=100${qs}`,
      { fetchImpl },
    );
    if (!Array.isArray(page) || page.length === 0) break;
    results.push(...page.map((entry) => entry.envVar));
    if (page.length < 100) break;
    cursor = page[page.length - 1].cursor;
    if (!cursor) break;
  }
  return results;
}

const NODE_OPTIONS_PREFIX = /^NODE_OPTIONS="[^"]*"\s+/;

/** Strip a leading NODE_OPTIONS="..." token, if present. Used only to
 * classify a difference, never to hide it — the caller still reports it. */
function stripNodeOptionsPrefix(command) {
  return typeof command === 'string' ? command.replace(NODE_OPTIONS_PREFIX, '') : command;
}

/**
 * Compare declared vs live. Returns:
 *   drift      — real disagreements the caller should fail on
 *   annotated  — disagreements explained by a known, deliberate difference
 *                (currently: a NODE_OPTIONS memory-cap prefix) — still
 *                printed, never silently dropped
 *   info       — context with no expectation to violate (autoDeploy, branch,
 *                live env vars not declared in the file at all)
 */
export function compareRenderConfig(declared, live, liveEnvVars) {
  const drift = [];
  const annotated = [];
  const info = [];

  const details = live.serviceDetails ?? {};
  const envSpecific = details.envSpecificDetails ?? {};

  const scalarComparisons = [
    ['name', declared.scalars.name, live.name],
    ['plan', declared.scalars.plan, details.plan],
    ['buildCommand', declared.scalars.buildCommand, envSpecific.buildCommand],
    ['startCommand', declared.scalars.startCommand, envSpecific.startCommand],
    ['preDeployCommand', declared.scalars.preDeployCommand, envSpecific.preDeployCommand],
    ['healthCheckPath', declared.scalars.healthCheckPath, details.healthCheckPath || null],
  ];

  for (const [field, fileValue, liveValue] of scalarComparisons) {
    if (fileValue === liveValue) continue;
    if (fileValue == null) {
      info.push(`${field}: not declared in render.yaml (live: ${JSON.stringify(liveValue)})`);
      continue;
    }
    const strippedLive = stripNodeOptionsPrefix(liveValue);
    if (strippedLive === fileValue) {
      annotated.push(
        `${field}: live carries a NODE_OPTIONS memory-cap prefix render.yaml does not — file=${JSON.stringify(fileValue)} live=${JSON.stringify(liveValue)}`,
      );
      continue;
    }
    drift.push(`${field}: file=${JSON.stringify(fileValue)} live=${JSON.stringify(liveValue)}`);
  }

  info.push(`autoDeploy: not declared in render.yaml (live: ${JSON.stringify(live.autoDeploy)})`);
  info.push(`branch: not declared in render.yaml (live: ${JSON.stringify(live.branch)})`);

  const liveByKey = new Map(liveEnvVars.map((v) => [v.key, v]));
  const missing = declared.envVars.filter((v) => !liveByKey.has(v.key));
  for (const v of missing) {
    drift.push(`env var ${v.key}: declared in render.yaml, absent on the live service`);
  }

  const valueMismatches = declared.envVars.filter((v) => {
    if (v.sync === false || v.value === undefined) return false;
    const liveVar = liveByKey.get(v.key);
    return liveVar && liveVar.value !== v.value;
  });
  for (const v of valueMismatches) {
    drift.push(
      `env var ${v.key}: file=${JSON.stringify(v.value)} live=${JSON.stringify(liveByKey.get(v.key).value)}`,
    );
  }

  const declaredKeys = new Set(declared.envVars.map((v) => v.key));
  const liveOnlyCount = liveEnvVars.filter((v) => !declaredKeys.has(v.key)).length;
  info.push(
    `${liveOnlyCount} env var(s) exist on the live service and are not declared in render.yaml (expected — dashboard-managed secrets and values are not required to round-trip into the file)`,
  );

  return {
    drift,
    annotated,
    info,
    declaredEnvVarCount: declared.envVars.length,
    liveEnvVarCount: liveEnvVars.length,
    missingEnvVarCount: missing.length,
  };
}

export async function runCheck({ root = ROOT_DEFAULT, apiKey = process.env.RENDER_API_KEY, fetchImpl } = {}) {
  if (!apiKey) {
    return { status: 'SKIPPED_NO_API_KEY', drift: [], annotated: [], info: [] };
  }

  const declared = readRenderYaml(root);
  const overrideId = process.env.RENDER_SERVICE_ID;
  const live = overrideId
    ? (await renderApiFetch(apiKey, `/services/${overrideId}`, { fetchImpl }))
    : await findLiveService(apiKey, { fetchImpl });
  const liveEnvVars = await fetchLiveEnvVars(apiKey, live.id, { fetchImpl });

  const comparison = compareRenderConfig(declared, live, liveEnvVars);
  return {
    status: comparison.drift.length ? 'DRIFT' : 'OK',
    serviceId: live.id,
    serviceName: live.name,
    ...comparison,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const root = argValue(argv, '--root') ? resolve(argValue(argv, '--root')) : ROOT_DEFAULT;

  let result;
  try {
    result = await runCheck({ root });
  } catch (error) {
    if (json) {
      console.log(JSON.stringify({ status: 'ERROR', message: String(error.message ?? error) }, null, 2));
    } else {
      console.error(`render config check failed: ${error.message ?? error}`);
    }
    process.exit(2);
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'DRIFT' ? 1 : 0);
  }

  if (result.status === 'SKIPPED_NO_API_KEY') {
    console.log('render.yaml drift check SKIPPED — RENDER_API_KEY is not set in this environment.');
    process.exit(0);
  }

  console.log(`render.yaml vs live service (${result.serviceName} / ${result.serviceId})`);
  console.log('');

  if (result.drift.length) {
    console.log(`DRIFT — ${result.drift.length} disagreement(s):`);
    for (const line of result.drift) console.log(`  x ${line}`);
  } else {
    console.log('No drift on the fields this script compares.');
  }

  if (result.annotated.length) {
    console.log('');
    console.log('Annotated (a known, deliberate difference — not counted as drift):');
    for (const line of result.annotated) console.log(`  ~ ${line}`);
  }

  if (result.info.length) {
    console.log('');
    console.log('Context:');
    for (const line of result.info) console.log(`  i ${line}`);
  }

  console.log('');
  console.log(
    `${result.declaredEnvVarCount} env var(s) declared in render.yaml, ${result.missingEnvVarCount} absent on the live service, ${result.liveEnvVarCount} present on the live service.`,
  );

  process.exit(result.status === 'DRIFT' ? 1 : 0);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main();
}
