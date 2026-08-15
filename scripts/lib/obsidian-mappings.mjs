/*
 * The repository → Obsidian vault mapping table, and the empty-note policy.
 *
 * Shared by scripts/sync-obsidian.mjs (which writes the notes) and
 * scripts/retrieve-knowledge.mjs (which must exclude them from search, because
 * every generated note is a copy of something already searched at higher
 * authority).
 *
 * They live here rather than in the sync script because the two derived
 * exclusion rules must not be able to disagree. When retrieval derived its
 * exclusions from the *local config* instead, a config that omitted `mappings`
 * silently disabled the dedup and every QA run came back twice — once from the
 * repository and once from its own generated copy.
 */

/** Destination folders are agent-owned; nothing else in the vault is written. */
export const DEFAULT_MAPPINGS = [
  { from: 'docs/knowledge/dashboards', to: '00 - Home/Generated' },
  { from: 'docs/backlog', to: '00 - Home/Generated/Backlog' },
  { from: 'docs/knowledge/product', to: '01 - Product/Generated' },
  { from: 'docs/knowledge/architecture', to: '02 - Architecture/Generated' },
  { from: 'docs/knowledge/modules', to: '03 - Modules/Generated' },
  { from: 'docs/knowledge/requirements', to: '04 - Requirements/Generated' },
  { from: 'docs/knowledge/decisions', to: '05 - Decisions/Generated' },
  { from: 'docs/decisions', to: '05 - Decisions/Generated/ADR' },
  { from: 'docs/knowledge/implementations', to: '06 - Implementation Plans/Generated' },
  { from: 'docs/bugs', to: '07 - Bugs/Generated' },
  { from: 'docs/knowledge/releases', to: '08 - Releases/Generated' },
  { from: 'docs/deployment/release-history', to: '08 - Releases/Generated/History' },
  { from: 'docs/knowledge/regressions', to: '11 - Agent Knowledge/Regressions/Generated' },
  { from: 'docs/qa/runs', to: '11 - Agent Knowledge/QA/Runs' },
  { from: 'docs/qa/regressions', to: '11 - Agent Knowledge/QA/Regressions' },
  { from: 'docs/qa/known-bug-patterns', to: '11 - Agent Knowledge/QA/Bug Patterns' },
  { from: 'docs/qa/test-strategy', to: '11 - Agent Knowledge/QA/Test Strategy' },
  { from: 'docs/engineering-history/tasks', to: '11 - Agent Knowledge/Engineering History' },
];

export const mappingKey = (mapping) => `${mapping.from}→${mapping.to}`;

/**
 * Merge a local config's mappings with the defaults. Config mappings **add**;
 * they never replace, so a config written months ago keeps receiving mappings
 * added later. `replaceMappings: true` opts out for anyone who wants an exact
 * set and accepts that new defaults will not reach their vault.
 */
export function resolveMappings(config) {
  const configured = Array.isArray(config?.mappings) ? config.mappings : [];

  if (config?.replaceMappings) return { mappings: configured, mode: 'replace' };

  const merged = [...DEFAULT_MAPPINGS];
  const seen = new Set(merged.map(mappingKey));
  for (const mapping of configured) {
    if (mapping?.from && mapping?.to && !seen.has(mappingKey(mapping))) {
      merged.push(mapping);
      seen.add(mappingKey(mapping));
    }
  }
  return { mappings: merged, mode: 'merge' };
}

/**
 * Every vault path this repository writes into. Retrieval excludes these
 * because their contents are copies of Git-tracked files it already searched.
 */
export function agentOwnedVaultPaths(mappings = DEFAULT_MAPPINGS) {
  return mappings
    .map((mapping) => String(mapping.to ?? '').replace(/[\\/]+$/, '').toLowerCase())
    .filter(Boolean);
}

/*
 * The empty-note policy.
 *
 * A note carrying a title, some headings and nothing under them is worse than
 * no note: it fills a folder, inflates every dashboard count, and answers a
 * search with a document that says nothing. The vault's bootstrap folders were
 * full of exactly that, which is what made an empty vault look populated.
 *
 * Deliberately crude. This rejects hollow notes; it does not grade prose.
 * Anything subtler produces arguments about wording instead of catching
 * placeholders.
 */
const PLACEHOLDER =
  /^(tbd|todo|n\/?a|none|coming soon|to be (written|filled|completed)|placeholder|_none\._?)$/i;

export function meaningfulContent(body) {
  const substantive = body
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#')) // headings are structure, not content
    .filter((line) => !/^[-*_]{3,}$/.test(line)) // horizontal rules
    .filter((line) => !/^>\s*\*\*Generated file/i.test(line)) // our own banner
    .filter((line) => !PLACEHOLDER.test(line.replace(/^[-*]\s*/, '')));

  return {
    substantiveLines: substantive.length,
    words: substantive.join(' ').split(/\s+/).filter(Boolean).length,
  };
}

/**
 * `minimumWords` is lower for folder READMEs: explaining a folder is a
 * legitimate job, and those notes are short by design.
 */
export function hasMeaningfulContent(body, { minimumWords = 40 } = {}) {
  const { substantiveLines, words } = meaningfulContent(body);
  return substantiveLines >= 2 && words >= minimumWords;
}
