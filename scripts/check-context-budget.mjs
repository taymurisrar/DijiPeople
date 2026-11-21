#!/usr/bin/env node
/*
 * Context-budget ratchet for the agent framework (SESSION-0135, phase 6).
 *
 * Every Claude Code session on this repository pays, before any work starts,
 * for the instruction files it auto-loads. That cost is paid by every task, so
 * it should only ever be a deliberate decision, never an accident of one more
 * paragraph. This script measures it and fails when it grows past a recorded
 * baseline.
 *
 *   node scripts/check-context-budget.mjs            check against the baseline
 *   node scripts/check-context-budget.mjs --report   print sizes, change nothing
 *   node scripts/check-context-budget.mjs --update   write the current numbers as
 *                                                    the new baseline (a reviewed act)
 *
 * Tokens are ESTIMATED as bytes / 4. That is a rough, consistent proxy, good for
 * detecting growth; it is not a billing figure.
 *
 * What it counts is only what is loaded EVERY session: the root instruction
 * files. Role, context and skill files are loaded selectively by design and are
 * reported, not budgeted.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'docs', 'engineering', 'context-budget-baseline.json');
const ALWAYS_LOADED = ['CLAUDE.md', 'AGENTS.md'];
const GROWTH_ALLOWANCE = 0.03; // 3 %: routine edits pass, a new section does not

const bytes = (p) => (existsSync(join(ROOT, p)) ? statSync(join(ROOT, p)).size : 0);
const tokens = (b) => Math.round(b / 4);

function dirTotal(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return { files: 0, bytes: 0 };
  const files = readdirSync(abs).filter((f) => f.endsWith('.md'));
  return { files: files.length, bytes: files.reduce((a, f) => a + statSync(join(abs, f)).size, 0) };
}

export function measure() {
  const always = Object.fromEntries(ALWAYS_LOADED.map((f) => [f, bytes(f)]));
  const alwaysBytes = Object.values(always).reduce((a, b) => a + b, 0);
  return {
    alwaysLoaded: { files: always, bytes: alwaysBytes, estimatedTokens: tokens(alwaysBytes) },
    selective: {
      '.agent/agents': dirTotal('.agent/agents'),
      '.agent/context': dirTotal('.agent/context'),
      '.agent/skills': dirTotal('.agent/skills'),
    },
  };
}

export function verdict(current, baseline, allowance = GROWTH_ALLOWANCE) {
  const limit = Math.floor(baseline.alwaysLoaded.bytes * (1 + allowance));
  return { ok: current.alwaysLoaded.bytes <= limit, limit };
}

function main() {
  const arg = process.argv[2];
  const current = measure();
  console.log(
    `Always-loaded instructions: ${current.alwaysLoaded.bytes} bytes (~${current.alwaysLoaded.estimatedTokens} tokens)`,
  );
  for (const [dir, v] of Object.entries(current.selective)) {
    console.log(`  ${dir}: ${v.files} files, ~${tokens(v.bytes)} tokens (loaded selectively)`);
  }
  if (arg === '--report') return;
  if (arg === '--update') {
    writeFileSync(BASELINE, JSON.stringify({ measuredOn: new Date().toISOString().slice(0, 10), ...current }, null, 2) + '\n');
    console.log(`Baseline written: ${BASELINE}`);
    return;
  }
  if (!existsSync(BASELINE)) {
    console.error('No baseline recorded. Run with --update once, as a reviewed act.');
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { ok, limit } = verdict(current, baseline);
  if (!ok) {
    console.error(
      `FAIL: always-loaded instructions grew to ${current.alwaysLoaded.bytes} bytes; ` +
        `limit ${limit} (baseline ${baseline.alwaysLoaded.bytes} + ${GROWTH_ALLOWANCE * 100}%). ` +
        'Move the new material into .agent/context/ and link to it, or re-baseline deliberately with --update.',
    );
    process.exit(1);
  }
  console.log(`OK: within budget (limit ${limit} bytes).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
