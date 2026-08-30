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

/**
 * Destination folders are agent-owned; nothing else in the vault is written.
 *
 * `nodeType` is part of the node contract: every generated note declares what
 * kind of thing it is, so verification can check the relationships it takes part
 * in rather than only whether its links resolve. Without it, a link between two
 * notes is either "resolves" or "does not", and a Bug pointing at a QA Run and a
 * Bug pointing at a dashboard look equally healthy.
 */
export const DEFAULT_MAPPINGS = [
  { from: 'docs/knowledge/dashboards', to: '00 - Home/Generated', nodeType: 'dashboard' },
  { from: 'docs/backlog', to: '00 - Home/Generated/Backlog', nodeType: 'backlog-item' },
  { from: 'docs/knowledge/product', to: '01 - Product/Generated', nodeType: 'product-knowledge' },
  { from: 'docs/knowledge/architecture', to: '02 - Architecture/Generated', nodeType: 'architecture' },
  { from: 'docs/knowledge/modules', to: '03 - Modules/Generated', nodeType: 'module' },
  { from: 'docs/knowledge/requirements', to: '04 - Requirements/Generated', nodeType: 'requirement' },
  { from: 'docs/knowledge/decisions', to: '05 - Decisions/Generated', nodeType: 'decision' },
  { from: 'docs/decisions', to: '05 - Decisions/Generated/ADR', nodeType: 'decision' },
  {
    from: 'docs/knowledge/implementations',
    to: '06 - Implementation Plans/Generated',
    nodeType: 'implementation',
  },
  /*
   * ExecPlans (ITEM-0099). Absent from this table until 2026-08-29, which made
   * **every `[[EXECPLAN-nnnn]]` wikilink in the vault resolve to nothing** —
   * and the plans are the one artefact bug records, task records and session
   * records all point at when they explain why something was built the way it
   * was. The graph was missing its most-referenced node type.
   *
   * A sibling of `knowledge/implementations` rather than the same folder: an
   * implementation note is written after the fact and describes what exists, a
   * plan is written before and describes what is intended. Merging them would
   * lose which of the two a reader is looking at.
   */
  {
    from: 'docs/plans',
    to: '06 - Implementation Plans/Generated/ExecPlans',
    nodeType: 'exec-plan',
  },
  { from: 'docs/bugs', to: '07 - Bugs/Generated', nodeType: 'bug' },
  { from: 'docs/knowledge/releases', to: '08 - Releases/Generated', nodeType: 'release' },
  {
    from: 'docs/deployment/release-history',
    to: '08 - Releases/Generated/History',
    nodeType: 'release',
  },
  {
    from: 'docs/knowledge/regressions',
    to: '11 - Agent Knowledge/Regressions/Generated',
    nodeType: 'regression',
  },
  /*
   * The framework's own durable lessons. A reconciliation of how the agent
   * system works is not product architecture, and filing it under Architecture
   * would put it where nobody looks for it.
   */
  {
    from: 'docs/knowledge/framework',
    to: '11 - Agent Knowledge/Framework',
    nodeType: 'framework-knowledge',
  },
  { from: 'docs/qa/runs', to: '11 - Agent Knowledge/QA/Runs', nodeType: 'qa-run' },
  { from: 'docs/qa/regressions', to: '11 - Agent Knowledge/QA/Regressions', nodeType: 'regression' },
  {
    from: 'docs/qa/known-bug-patterns',
    to: '11 - Agent Knowledge/QA/Bug Patterns',
    nodeType: 'bug-pattern',
  },
  {
    from: 'docs/qa/test-strategy',
    to: '11 - Agent Knowledge/QA/Test Strategy',
    nodeType: 'test-strategy',
  },
  /*
   * Test plans and scenarios are the durable half of QA — what must always be
   * true about an area, and the reusable cases that prove it. Runs are history;
   * these are what somebody reads to find out what the product is supposed to
   * guarantee, so they belong beside the runs rather than buried under them.
   */
  { from: 'docs/qa/test-plans', to: '11 - Agent Knowledge/QA/Test Plans', nodeType: 'test-plan' },
  { from: 'docs/qa/scenarios', to: '11 - Agent Knowledge/QA/Scenarios', nodeType: 'qa-scenario' },
  {
    from: 'docs/engineering-history/tasks',
    to: '11 - Agent Knowledge/Engineering History',
    nodeType: 'engineering-history',
  },
  /*
   * Parent tasks carry live orchestration state — which work packages are done,
   * which are blocked and why. Publishing them puts "what is in flight" beside
   * the backlog and the engineering history, which is where somebody reading the
   * vault expects to find it.
   */
  { from: 'docs/tasks', to: '00 - Home/Generated/Tasks', nodeType: 'task' },
  /*
   * Sessions answer "who was working on what, from which base, holding which
   * leases" — a question that only becomes interesting once several Architect
   * chats run at once, and one nothing else in the vault records.
   */
  { from: 'docs/sessions', to: '00 - Home/Generated/Sessions', nodeType: 'session' },
  /*
   * Questions and their answers. Projected because "what has the user already
   * decided" is exactly the kind of thing somebody reads the vault to find, and
   * because an answered question is the reasoning its ADR compresses away.
   */
  { from: 'docs/questions', to: '05 - Decisions/Generated/Questions', nodeType: 'question' },
  /*
   * The data model. A top-level folder rather than a child of Architecture,
   * because entity notes nested three levels under `02 - Architecture` are notes
   * nobody finds — and the schema is the source the discovery protocol ranks
   * first, not an appendix to how the system is built.
   *
   * The facts inside each note are regenerated by
   * `scripts/generate-data-model.mjs`; the prose around them is not. Both halves
   * publish together because a reader wants the meaning and the columns on the
   * same page.
   */
  { from: 'docs/knowledge/data-model', to: '12 - Data Model/Generated', nodeType: 'entity' },
  /*
   * What discovery has and has not covered, what contradicts what, and what is
   * still unverified. Filed with the framework's own knowledge rather than with
   * the product's: these notes describe the state of the documentation effort,
   * not the state of DijiPeople.
   */
  {
    from: 'docs/knowledge/discovery',
    to: '11 - Agent Knowledge/Discovery',
    nodeType: 'framework-knowledge',
  },
];

/**
 * The node type of one file under a mapping.
 *
 * Almost always the mapping's own type. The exception is `docs/tasks`, which
 * carries two populations: the parent records themselves, and the per-package
 * files in the `work-packages/` subdirectory that TASK-0012 introduced. They
 * are different kinds of thing and take part in different relationships, so
 * they must not share a type.
 */
export function nodeTypeFor(mapping, relativePath) {
  const path = String(relativePath ?? '').split('\\').join('/');
  if (mapping.from === 'docs/tasks' && path.includes('/work-packages/')) return 'work-package';
  if (mapping.from === 'docs/backlog' && path.startsWith('items/')) return 'backlog-item';
  return mapping.nodeType ?? 'note';
}

/**
 * Node types that carry knowledge, as opposed to listing it.
 *
 * A bug, an item, a task, a decision, a regression — each says something about
 * the system. A dashboard or an index says only what other notes exist.
 */
export const KNOWLEDGE_NODE_TYPES = [
  'bug',
  'backlog-item',
  'task',
  'work-package',
  'question',
  'requirement',
  'decision',
  'qa-scenario',
  'qa-run',
  'regression',
  'bug-pattern',
  'test-plan',
  'test-strategy',
  'module',
  'architecture',
  'implementation',
  'release',
  'engineering-history',
  'session',
  'framework-knowledge',
  'product-knowledge',
  'entity',
];

/**
 * Generated *listing* surfaces rather than knowledge.
 *
 * Linking **into** one of these is the failure this rule exists to catch. It is
 * the cheapest possible way to clear a graph orphan — point the isolated note at
 * the index and the dot disappears — and it teaches a reader nothing while
 * diluting every real edge around it.
 */
export const LISTING_NODE_TYPES = ['dashboard'];

/**
 * Is a link from `fromType` to `toType` meaningful?
 *
 * This began as an allow-list enumerating which pairs were legitimate, and that
 * was wrong. Run against the real vault it produced 607 errors, and reading them
 * showed almost every one was a **good** link: a backlog item pointing at the
 * bug pattern it addresses, an item citing the requirement it came from, product
 * knowledge naming the defects that shaped it. The grammar was not describing
 * the graph; it was describing one author's guess about the graph, and the graph
 * was right.
 *
 * A verifier that cries wolf gets skipped, which is exactly how the thing it
 * verifies rots — the same lesson the orphan scan already carries in this file,
 * and the same one BUG-0034 taught the contradiction detector.
 *
 * So the rule is now the one that is actually defensible: knowledge may link to
 * knowledge, and nothing may link into a generated listing surface. That still
 * forbids the move the framework cares about — adding an edge to remove a dot —
 * without inventing relationships nobody agreed to.
 *
 * Unknown types pass. A verifier that fails on a type it has never heard of
 * blocks every new record kind on the day it is introduced.
 */
export function relationshipIsValid(fromType, toType) {
  if (!fromType || !toType) return true;
  /* A listing surface links everywhere by design; that is its whole job. */
  if (LISTING_NODE_TYPES.includes(fromType)) return true;
  return !LISTING_NODE_TYPES.includes(toType);
}

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
