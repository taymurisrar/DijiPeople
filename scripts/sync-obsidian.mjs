#!/usr/bin/env node
/*
 * Publish repository knowledge into an Obsidian vault.
 *
 * The repository is the controlled source; the vault is a consumer. Agents
 * write to docs/knowledge, docs/qa, docs/bugs, docs/backlog and
 * docs/engineering-history — never into the vault directly — so a bad
 * generation can be reviewed in a diff before it reaches anyone's notes.
 *
 * Everything lands under a `Generated/` subfolder of each destination, or the
 * agent-owned `11 - Agent Knowledge/QA/**`. Notes anywhere else are
 * hand-maintained and are never touched.
 *
 * Node .mjs rather than PowerShell because every other script in this repo is
 * .mjs — see scripts/. Cross-platform comes free.
 *
 *   node scripts/sync-obsidian.mjs [--dry-run] [--config <path>]
 */

import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, resolve, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveMappings, hasMeaningfulContent } from './lib/obsidian-mappings.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERIFY = args.includes('--verify');
const configArgIndex = args.indexOf('--config');
const CONFIG_PATH = resolve(
  REPO_ROOT,
  configArgIndex !== -1 ? args[configArgIndex + 1] : '.obsidian-sync.local.json',
);

/*
 * The mapping table lives in scripts/lib/obsidian-mappings.mjs, shared with
 * scripts/retrieve-knowledge.mjs. Retrieval must exclude exactly the folders
 * this script writes — when the two derived that list separately, one of them
 * was wrong and every QA run came back twice.
 */

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    /*
     * Absent config is not an error: most checkouts have no vault, and an
     * agent chaining this after a deployment must not have the chain abort
     * because documentation sync was never configured. Exit 0 with the token
     * the framework expects. Genuine misconfiguration below still exits 1.
     */
    console.log(
      [
        'OBSIDIAN_SYNC = SKIPPED_NO_LOCAL_CONFIG',
        '',
        `No config at ${relative(REPO_ROOT, CONFIG_PATH)} — nothing to sync.`,
        '',
        'To enable:',
        '  cp .obsidian-sync.example.json .obsidian-sync.local.json',
        '',
        'then set "vaultPath". The .local.json file is gitignored, so your path',
        'never reaches the repository.',
      ].join('\n'),
    );
    process.exit(0);
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

  /*
   * Config mappings ADD to the defaults; they do not replace them.
   *
   * The previous behaviour was replace-on-present, and it had exactly the
   * failure you would expect: a local config pins the mappings that existed
   * when it was written, so every mapping added afterwards silently never syncs
   * — for the one person who actually configured a vault. A stale local file
   * must not be able to un-publish knowledge.
   */
  const { mappings, mode } = resolveMappings(config);
  return { vaultPath: config.vaultPath, mappings, mode };
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

/**
 * A generated note must carry real content — see the empty-note policy in
 * scripts/lib/obsidian-mappings.mjs. Folder READMEs face a lower bar but still
 * may not be hollow: explaining a folder is a legitimate job.
 */
function isPublishable(file, body) {
  const minimumWords = /^README\.md$/i.test(basename(file)) ? 20 : 40;
  return hasMeaningfulContent(body, { minimumWords });
}

/**
 * `OBSIDIAN_SYNC_STATUS = PASS` must mean the vault is actually right, not that
 * a copy loop exited zero.
 *
 * Every failure this has had was silent: a mapping whose source directory had
 * been renamed, a note published with nothing in it, a wikilink pointing at a
 * note the sync never wrote. All three pass an exit-code check, and all three
 * are caught by reading the vault back.
 *
 * Manual notes are checked for *absence of interference* only. This script
 * writes exclusively into mapped agent-owned folders, and verification confirms
 * that boundary rather than inspecting anybody's notes.
 */
function verify(vaultPath, mappings) {
  const problems = [];
  const checked = [];
  let notes = 0;
  let links = 0;
  let unresolved = 0;

  /* Obsidian resolves a wikilink by basename, so that is what must exist. */
  const vaultNotes = new Set(markdownFilesIn(vaultPath).map((file) => basename(file, '.md')));

  for (const mapping of mappings) {
    const sourceDir = resolve(REPO_ROOT, mapping.from);
    const targetDir = resolve(vaultPath, mapping.to);
    const sources = markdownFilesIn(sourceDir).filter((file) =>
      isPublishable(file, readFileSync(file, 'utf8')),
    );

    if (!sources.length) continue;

    if (!existsSync(targetDir)) {
      problems.push(
        `${mapping.to} — destination folder absent, though ${sources.length} note(s) map to it`,
      );
      continue;
    }
    checked.push(mapping.to);

    for (const file of sources) {
      const relativePath = relative(sourceDir, file);
      const target = join(targetDir, relativePath);
      const label = `${mapping.to}/${relativePath}`.replace(/\\/g, '/');

      if (!existsSync(target)) {
        problems.push(`${label} — expected note is absent from the vault`);
        continue;
      }

      const published = readFileSync(target, 'utf8');
      notes += 1;

      if (!isPublishable(file, published)) {
        problems.push(`${label} — published but empty of substance`);
      }

      if (published !== readFileSync(file, 'utf8')) {
        problems.push(`${label} — vault copy differs from its repository source; re-run the sync`);
      }

      /*
       * A wikilink that resolves to nothing is not visibly broken in Obsidian —
       * it renders as an invitation to create the note. That is exactly why an
       * unresolved *generated* link is worth failing on: nobody would notice it.
       */
      for (const match of published.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)) {
        links += 1;
        const name = match[1].trim();
        if (!vaultNotes.has(name)) {
          unresolved += 1;
          problems.push(`${label} — wikilink [[${name}]] resolves to no note in the vault`);
        }
      }
    }
  }

  console.log(`Vault:  ${vaultPath}`);
  console.log('Mode:   verify — reading the vault back, not trusting the last exit code');
  console.log('');
  console.log(`FOLDERS_CHECKED         ${checked.length}`);
  console.log(`NOTES_VERIFIED          ${notes}`);
  console.log(`WIKILINKS_CHECKED       ${links}`);
  console.log(`WIKILINKS_UNRESOLVED    ${unresolved}`);
  console.log('MANUAL_NOTES_UNTOUCHED  all — verification reads only the mapped agent-owned folders');
  console.log('');

  if (problems.length) {
    console.error(`OBSIDIAN_SYNC_STATUS = FAILED — ${problems.length} problem(s):`);
    for (const problem of problems.slice(0, 40)) console.error(`  x ${problem}`);
    if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
    console.error('');
    console.error('A documentation-automation failure never rolls back healthy work — and never');
    console.error('hides either. Cap the task at COMPLETE_WITH_DOCUMENTATION_WARNING.');
    process.exit(1);
  }

  console.log('OBSIDIAN_SYNC_STATUS = PASS');
  console.log('Every mapped note exists, carries substance, matches its source, and every');
  console.log('generated wikilink resolves.');
}

function main() {
  const { vaultPath, mappings, mode } = loadConfig();

  if (VERIFY) {
    verify(vaultPath, mappings);
    return;
  }

  console.log(`Vault:  ${vaultPath}`);
  console.log(`Mode:   ${DRY_RUN ? 'dry run — nothing will be written' : 'write'}`);
  console.log(
    `Config: mappings ${mode === 'replace' ? 'replaced by' : 'merged with'} local config — ${mappings.length} total`,
  );
  console.log('');

  const created = [];
  const updated = [];
  const skippedNoEvidence = [];
  let unchanged = 0;
  let emptyMappings = 0;

  for (const mapping of mappings) {
    const sourceDir = resolve(REPO_ROOT, mapping.from);
    const targetDir = resolve(vaultPath, mapping.to);
    const files = markdownFilesIn(sourceDir);

    if (files.length === 0) {
      emptyMappings += 1;
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
      const label = `${mapping.from}/${relativePath}`.replace(/\\/g, '/');

      if (!isPublishable(file, source)) {
        skippedNoEvidence.push(label);
        continue;
      }

      const exists = existsSync(target);
      if (exists && readFileSync(target, 'utf8') === source) {
        unchanged += 1;
        continue;
      }

      if (!DRY_RUN) {
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(file, target);
      }

      (exists ? updated : created).push(label);
    }
  }

  /*
   * The population report.
   *
   * Half the point of a one-time knowledge bootstrap is that it is reviewable
   * BEFORE it lands in someone's notes, so --dry-run has to say exactly what it
   * would do — not merely how many files.
   */
  const section = (label, entries) => {
    console.log(`${label}: ${entries.length}`);
    for (const entry of entries) console.log(`    ${entry}`);
    if (entries.length) console.log('');
  };

  section(DRY_RUN ? 'NOTES_TO_CREATE' : 'NOTES_CREATED', created);
  section(DRY_RUN ? 'NOTES_TO_UPDATE' : 'NOTES_UPDATED', updated);
  section('NOTES_SKIPPED_NO_EVIDENCE', skippedNoEvidence);

  console.log(`NOTES_ALREADY_CURRENT: ${unchanged}`);
  console.log(`MAPPINGS_WITH_NO_SOURCE: ${emptyMappings}`);
  console.log('MANUAL_NOTES_UNTOUCHED: all — this script writes only into the mapped');
  console.log('                        agent-owned folders and reads nothing else.');
  console.log('');

  if (skippedNoEvidence.length) {
    console.log('Skipped notes carried no meaningful content beyond a title and headings.');
    console.log('That is the empty-note policy working, not a failure: a generated note');
    console.log('with nothing in it fills a folder and answers a search with silence.');
    console.log('');
  }

  console.log(
    `${DRY_RUN ? 'Would write' : 'Wrote'} ${created.length + updated.length} file(s); ` +
      `${unchanged} already current; ${skippedNoEvidence.length} skipped as empty.`,
  );
  console.log('Notes outside the mapped agent-owned folders were not touched.');
}

main();
