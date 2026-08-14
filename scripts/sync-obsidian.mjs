#!/usr/bin/env node
/*
 * Publish repository knowledge into an Obsidian vault.
 *
 * The repository is the controlled source; the vault is a consumer. Agents
 * write to docs/knowledge and docs/qa, never into the vault directly, so a
 * bad generation can be reviewed in a diff before it reaches anyone's notes.
 *
 * Everything lands under a `Generated/` subfolder of each destination. Notes
 * outside `Generated/` are hand-maintained and are never touched.
 *
 * Node .mjs rather than PowerShell because every other script in this repo is
 * .mjs — see scripts/. Cross-platform comes free.
 *
 *   node scripts/sync-obsidian.mjs [--dry-run] [--config <path>]
 */

import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const configArgIndex = args.indexOf('--config');
const CONFIG_PATH = resolve(
  REPO_ROOT,
  configArgIndex !== -1 ? args[configArgIndex + 1] : '.obsidian-sync.local.json',
);

/*
 * Destinations are relative to the vault root and always end in Generated/, so
 * a sync can never overwrite a note a human wrote.
 */
const DEFAULT_MAPPINGS = [
  { from: 'docs/knowledge/modules', to: '03 - Modules/Generated' },
  { from: 'docs/knowledge/decisions', to: '05 - Decisions/Generated' },
  { from: 'docs/knowledge/implementations', to: '06 - Implementation Plans/Generated' },
  { from: 'docs/knowledge/releases', to: '08 - Releases/Generated' },
  { from: 'docs/knowledge/regressions', to: '11 - Agent Knowledge/Regressions/Generated' },
  { from: 'docs/qa/runs', to: '11 - Agent Knowledge/QA/Runs' },
  { from: 'docs/qa/regressions', to: '11 - Agent Knowledge/QA/Regressions' },
  { from: 'docs/qa/known-bug-patterns', to: '11 - Agent Knowledge/QA/Bug Patterns' },
  { from: 'docs/qa/test-strategy', to: '11 - Agent Knowledge/QA/Test Strategy' },
];

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error(
      [
        '',
        `No config found at ${relative(REPO_ROOT, CONFIG_PATH)}`,
        '',
        'Create it by copying the committed example:',
        '',
        '  cp .obsidian-sync.example.json .obsidian-sync.local.json',
        '',
        'then set "vaultPath" to your vault. The .local.json file is gitignored',
        'so your path never reaches the repository.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  if (!config.vaultPath || config.vaultPath.startsWith('<')) {
    console.error(`Set "vaultPath" in ${relative(REPO_ROOT, CONFIG_PATH)} first.`);
    process.exit(1);
  }
  if (!existsSync(config.vaultPath)) {
    console.error(`Vault not found: ${config.vaultPath}`);
    process.exit(1);
  }

  return {
    vaultPath: config.vaultPath,
    mappings: config.mappings?.length ? config.mappings : DEFAULT_MAPPINGS,
  };
}

/** Markdown files only. Never copies anything else out of the repository. */
function markdownFilesIn(dir) {
  const out = [];
  if (!existsSync(dir)) return out;

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...markdownFilesIn(full));
    else if (entry.endsWith('.md')) out.push(full);
  }

  return out;
}

function main() {
  const { vaultPath, mappings } = loadConfig();

  console.log(`Vault:  ${vaultPath}`);
  console.log(`Mode:   ${DRY_RUN ? 'dry run — nothing will be written' : 'write'}`);
  console.log('');

  let copied = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const mapping of mappings) {
    const sourceDir = resolve(REPO_ROOT, mapping.from);
    const targetDir = resolve(vaultPath, mapping.to);
    const files = markdownFilesIn(sourceDir);

    if (files.length === 0) {
      skipped += 1;
      console.log(`  --  ${mapping.from} → ${mapping.to} (nothing to sync)`);
      continue;
    }

    for (const file of files) {
      /*
       * Same source file always maps to the same target note. Evergreen notes
       * update in place; nothing is ever timestamped on the way in. QA runs
       * carry their date in the filename already, so they accumulate as
       * history without any special handling here.
       */
      const relativePath = relative(sourceDir, file);
      const target = join(targetDir, relativePath);

      const source = readFileSync(file, 'utf8');
      const identical = existsSync(target) && readFileSync(target, 'utf8') === source;

      if (identical) {
        unchanged += 1;
        continue;
      }

      if (!DRY_RUN) {
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(file, target);
      }

      copied += 1;
      console.log(`  ${DRY_RUN ? 'would copy' : 'copied'}  ${mapping.from}/${relativePath}`);
    }
  }

  console.log('');
  console.log(`${DRY_RUN ? 'Would write' : 'Wrote'} ${copied} file(s); ${unchanged} already current; ${skipped} mapping(s) empty.`);
  console.log('Notes outside Generated/ folders were not touched.');
}

main();
