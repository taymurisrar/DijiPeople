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
 * Which relationships mean something.
 *
 * A link is valid when it resolves **and** the two ends have a defined
 * relationship. Without this, "the graph is connected" is satisfied by any link
 * at all, and the cheapest way to clear a graph orphan is to point it at
 * whatever note is nearest — which destroys the signal the orphan was carrying.
 *
 * Read as: a note of type <key> may meaningfully link to a note of these types.
 * Symmetry is not assumed; each direction is declared where it is meant.
 */
export const NODE_RELATIONSHIPS = {
  bug: ['module', 'regression', 'qa-scenario', 'qa-run', 'task', 'backlog-item', 'bug', 'decision', 'bug-pattern'],
  'backlog-item': ['module', 'task', 'bug', 'decision', 'qa-scenario', 'backlog-item', 'architecture'],
  task: ['bug', 'backlog-item', 'module', 'work-package', 'task', 'decision', 'engineering-history', 'session'],
  'work-package': ['task', 'bug', 'backlog-item', 'module', 'decision', 'question', 'work-package'],
  requirement: ['module', 'decision', 'implementation', 'architecture'],
  decision: ['architecture', 'module', 'requirement', 'question', 'bug', 'backlog-item'],
  question: ['decision', 'task', 'work-package', 'module'],
  'qa-scenario': ['module', 'bug', 'regression', 'test-plan', 'qa-run'],
  'qa-run': ['qa-scenario', 'bug', 'regression', 'test-plan', 'module'],
  regression: ['bug', 'qa-scenario', 'module', 'bug-pattern'],
  'bug-pattern': ['bug', 'regression', 'module', 'architecture'],
  'test-plan': ['qa-scenario', 'module', 'qa-run'],
  'test-strategy': ['test-plan', 'qa-scenario', 'module'],
  module: ['architecture', 'bug', 'requirement', 'implementation', 'qa-scenario', 'module'],
  architecture: ['module', 'decision', 'requirement', 'implementation'],
  implementation: ['requirement', 'module', 'architecture', 'task'],
  release: ['engineering-history', 'task', 'module'],
  'engineering-history': ['task', 'release', 'bug', 'session'],
  session: ['task', 'work-package'],
  'framework-knowledge': ['task', 'decision', 'architecture', 'bug-pattern', 'regression'],
  'product-knowledge': ['module', 'requirement', 'architecture'],
  /*
   * Dashboards link to everything by design — they are listing surfaces. Given
   * an empty allow-list they would produce a semantic error per row, so they are
   * exempt rather than enumerated.
   */
  dashboard: null,
};

/**
 * Is a link from `fromType` to `toType` meaningful?
 *
 * Unknown types pass. A verifier that fails on a type it has never heard of
 * blocks every new record kind on the day it is introduced, and the first
 * response to that is to disable the verifier.
 */
export function relationshipIsValid(fromType, toType) {
  if (!fromType || !toType) return true;
  const allowed = NODE_RELATIONSHIPS[fromType];
  if (allowed === null) return true;
  if (!allowed) return true;
  if (!(toType in NODE_RELATIONSHIPS)) return true;
  return allowed.includes(toType);
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
