/*
 * Where the Obsidian vault configuration actually lives.
 *
 * The sync used to read `.obsidian-sync.local.json` from the current working
 * directory and nothing else. That is right for a single checkout and wrong for
 * the way this repository is actually worked: every task runs in its own
 * worktree, the config is gitignored, and so **every task worktree reported
 * `SKIPPED_NO_LOCAL_CONFIG` while a perfectly good vault sat configured in the
 * primary checkout**. Two consecutive framework tasks finished that way.
 *
 * Resolution order, first hit wins:
 *
 *   1. the current worktree's `.obsidian-sync.local.json`
 *   2. the primary checkout's — derived from `--git-common-dir`, so it is found
 *      from any worktree without anybody configuring anything
 *   3. a shared config inside the Git common directory, for a vault that should
 *      apply to every worktree but belongs in no checkout
 *   4. `DIJIPEOPLE_OBSIDIAN_CONFIG` (a config path) or
 *      `DIJIPEOPLE_OBSIDIAN_VAULT` (a vault path directly), for CI and for
 *      anybody who would rather not keep a file at all
 *
 * `.obsidian-sync.example.json` is **never** a source of runtime configuration.
 * It is the tracked template: it documents the schema and carries a placeholder
 * `vaultPath` in angle brackets. Treating it as configured is how a sync would
 * "succeed" against a directory named `<absolute path to your Obsidian vault>`.
 * Both files exist on purpose and neither replaces the other.
 *
 * No dependencies.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export const LOCAL_CONFIG_NAME = '.obsidian-sync.local.json';
export const EXAMPLE_CONFIG_NAME = '.obsidian-sync.example.json';
const SHARED_CONFIG_NAME = 'obsidian-sync.json';

/**
 * Config-status vocabulary. `FOUND_*` means a real vault path was resolved;
 * everything else means the caller must not claim a sync happened.
 */
export const CONFIG_STATUSES = [
  'FOUND_WORKTREE',
  'FOUND_PRIMARY',
  'FOUND_SHARED',
  'FOUND_ENV',
  'NOT_CONFIGURED',
  'INVALID',
];

function git(root, args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

/** The Git directory every worktree of this repository shares. */
export function gitCommonDir(root) {
  const common = git(root, ['rev-parse', '--git-common-dir'], '');
  if (!common) return null;
  return resolve(root, common);
}

/**
 * The primary checkout — the working tree the shared Git directory belongs to.
 *
 * For a linked worktree `--git-common-dir` is `<primary>/.git`, so the parent of
 * that directory is the primary checkout. For the primary checkout itself it is
 * `.git`, and the parent is the checkout again. Both cases fall out of the same
 * expression, which is why this is not special-cased.
 */
export function primaryCheckout(root) {
  const common = gitCommonDir(root);
  if (!common) return null;
  const parent = dirname(common);
  return existsSync(parent) ? parent : null;
}

/**
 * A placeholder `vaultPath` is not configuration.
 *
 * The example file ships `<absolute path to your Obsidian vault, e.g. …>`, and a
 * half-filled local config is a real thing people leave behind. Either way the
 * honest answer is "not configured", not a sync against a directory that does
 * not exist.
 */
function isPlaceholder(vaultPath) {
  const value = String(vaultPath ?? '').trim();
  if (!value) return true;
  if (value.startsWith('<') || value.includes('e.g.')) return true;
  if (!isAbsolute(value)) return true;
  return false;
}

function loadCandidate(path, source) {
  if (!existsSync(path)) return null;

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return {
      status: 'INVALID',
      configPath: path,
      source,
      reason: `unreadable JSON — ${String(error.message).split('\n')[0]}`,
    };
  }

  if (isPlaceholder(parsed?.vaultPath)) {
    return {
      status: 'INVALID',
      configPath: path,
      source,
      reason: 'vaultPath is absent or still a placeholder',
    };
  }

  return { status: source, configPath: path, config: parsed, vaultPath: parsed.vaultPath };
}

/**
 * Resolve the Obsidian configuration for this worktree.
 *
 * Never throws, and never returns a vault path it has not confirmed exists on
 * disk — a configured-but-missing vault is `INVALID`, which is a different and
 * more actionable statement than "not configured".
 */
export function resolveObsidianConfig(root, { env = process.env } = {}) {
  const attempts = [];
  const candidates = [];

  /* 1 — this worktree. */
  candidates.push([join(root, LOCAL_CONFIG_NAME), 'FOUND_WORKTREE']);

  /* 2 — the primary checkout, found from any worktree. */
  const primary = primaryCheckout(root);
  if (primary && resolve(primary) !== resolve(root)) {
    candidates.push([join(primary, LOCAL_CONFIG_NAME), 'FOUND_PRIMARY']);
  }

  /* 3 — shared, inside the Git common directory. */
  const common = gitCommonDir(root);
  if (common) candidates.push([join(common, SHARED_CONFIG_NAME), 'FOUND_SHARED']);

  for (const [path, source] of candidates) {
    const found = loadCandidate(path, source);
    if (!found) {
      attempts.push({ source, configPath: path, result: 'absent' });
      continue;
    }
    if (found.status === 'INVALID') {
      attempts.push({ source, configPath: path, result: found.reason });
      continue;
    }
    if (!existsSync(found.vaultPath)) {
      attempts.push({ source, configPath: path, result: `vault not found: ${found.vaultPath}` });
      continue;
    }
    return { ...found, attempts };
  }

  /* 4 — environment. A vault path directly, or a path to a config file. */
  const envConfig = env.DIJIPEOPLE_OBSIDIAN_CONFIG;
  if (envConfig) {
    const found = loadCandidate(resolve(root, envConfig), 'FOUND_ENV');
    if (found && found.status !== 'INVALID' && existsSync(found.vaultPath)) {
      return { ...found, attempts };
    }
    attempts.push({
      source: 'FOUND_ENV',
      configPath: envConfig,
      result: found ? found.reason ?? 'vault not found' : 'absent',
    });
  }

  const envVault = env.DIJIPEOPLE_OBSIDIAN_VAULT;
  if (envVault && !isPlaceholder(envVault) && existsSync(envVault)) {
    return {
      status: 'FOUND_ENV',
      configPath: null,
      source: 'DIJIPEOPLE_OBSIDIAN_VAULT',
      config: { vaultPath: envVault },
      vaultPath: envVault,
      attempts,
    };
  }
  if (envVault) {
    attempts.push({
      source: 'FOUND_ENV',
      configPath: 'DIJIPEOPLE_OBSIDIAN_VAULT',
      result: existsSync(envVault) ? 'placeholder' : `vault not found: ${envVault}`,
    });
  }

  /*
   * The example file is checked last and only to report *why* nothing was
   * found. It is never returned as configuration.
   */
  const example = join(root, EXAMPLE_CONFIG_NAME);
  return {
    status: 'NOT_CONFIGURED',
    configPath: null,
    source: null,
    config: null,
    vaultPath: null,
    exampleAvailable: existsSync(example),
    attempts,
  };
}

/** One line per candidate, for a report that has to explain a NOT_CONFIGURED. */
export function describeResolution(resolution) {
  const lines = [`OBSIDIAN_CONFIG_STATUS = ${resolution.status}`];
  if (resolution.vaultPath) {
    lines.push(`OBSIDIAN_VAULT_PATH    = ${resolution.vaultPath}`);
    lines.push(`OBSIDIAN_CONFIG_SOURCE = ${resolution.configPath ?? resolution.source}`);
  }
  if (resolution.attempts?.length) {
    lines.push('', 'Looked in:');
    for (const attempt of resolution.attempts) {
      lines.push(`  ${attempt.source.padEnd(15)} ${attempt.configPath} — ${attempt.result}`);
    }
  }
  return lines.join('\n');
}
