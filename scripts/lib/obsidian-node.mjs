/*
 * The generated-node contract: provenance written into every published note.
 *
 * Until now the sync was a byte-for-byte copy, and verification compared the
 * copy to its source. That answers "is the content the same" and nothing else.
 * It cannot answer where a note came from, so a note could only be matched back
 * to its source by **filename similarity** — which silently survives a rename,
 * a move, or two records whose titles converge.
 *
 * So every generated note now carries where it came from:
 *
 *   generated: true
 *   node_type: bug
 *   source_id: BUG-0005
 *   source_path: docs/bugs/BUG-0005-....md
 *   source_commit: 3f9063f
 *   status: VERIFIED
 *   last_verified: 2026-08-19
 *   modules: [services/api/src/modules/auth]
 *
 * `generated: true` is what protects everything else. A note without it belongs
 * to a human, and generated sync never writes, overwrites or deletes one.
 *
 * FRESHNESS IS THE SOURCE'S LAST COMMIT, NOT HEAD. This matters more than it
 * looks. Stamping HEAD would change every note on every run, so every note would
 * always differ from its vault copy, every verification would report total
 * drift, and the first response would be to stop reading the output. Stamping
 * the commit that last touched the source file makes the provenance stable,
 * deterministic and — unlike a timestamp — actually true: it is the version of
 * the source this note reflects.
 *
 * Rendering lives here rather than in the sync script because write and verify
 * must produce byte-identical output. Two copies of this logic would drift, and
 * the drift would present as permanent, unfixable "vault differs from source".
 *
 * No dependencies.
 */

/** Keys this contract owns. A source that declares one of its own is overridden. */
export const PROVENANCE_KEYS = [
  'generated',
  'node_type',
  'source_id',
  'source_path',
  'source_commit',
  'status',
  'last_verified',
  'modules',
];

/** Split `---\n...\n---\n` off the front of a note. */
export function splitNote(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { frontmatter: '', body: text, hadFrontmatter: false };
  return {
    frontmatter: match[1],
    body: text.slice(match[0].length),
    hadFrontmatter: true,
  };
}

function readKey(frontmatter, ...names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^${escaped}:\\s*(.*)$`, 'm').exec(frontmatter);
    if (match) {
      const value = match[1].trim().replace(/^["']|["']$/g, '');
      if (value) return value;
    }
  }
  return '';
}

/**
 * The canonical id of the record this note reflects.
 *
 * Tried in order of authority: an explicit id field, then the first alias, then
 * a well-formed id at the start of the filename. The filename is last because
 * it is the weakest signal — it is exactly what this contract exists to stop
 * relying on — but it is still better than nothing for the notes that carry no
 * frontmatter at all.
 */
export function deriveSourceId(frontmatter, filename) {
  const explicit = readKey(
    frontmatter,
    'ID',
    'TASK_ID',
    'WP_ID',
    'QUESTION_ID',
    'SESSION_ID',
    'BUG_ID',
    'ITEM_ID',
  );
  if (explicit) return explicit;

  const aliases = /^aliases:\s*\[([^\]]*)\]\s*$/m.exec(frontmatter);
  if (aliases) {
    const first = aliases[1].split(',')[0]?.trim().replace(/^["']|["']$/g, '');
    if (first) return first;
  }

  const stem = String(filename).replace(/\.md$/i, '');
  const known = /^((?:BUG|ITEM|TASK|SESSION|ADR|QUESTION|PLAN|WP)-\d+|QA-[A-Z]+-\d+|REG-\d+)/.exec(stem);
  return known ? known[1] : stem;
}

/** The record's canonical status, where it has one. */
export function deriveStatus(frontmatter) {
  return readKey(frontmatter, 'Status', 'STATUS', 'TASK_STATUS');
}

/** Modules the record names, as a flat list. */
export function deriveModules(frontmatter) {
  const raw = readKey(frontmatter, 'AffectedModules', 'AFFECTED_MODULES', 'modules', 'MODULES');
  if (!raw) return [];
  return raw
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((entry) => entry.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/**
 * Produce the published note for a source file.
 *
 * Deterministic: the same inputs always yield the same bytes, which is what lets
 * verification compare rather than re-sync.
 */
export function renderNote({ source, sourcePath, filename, nodeType, sourceCommit, lastVerified }) {
  const { frontmatter, body, hadFrontmatter } = splitNote(source);

  /*
   * Strip any provenance the source itself declares. A record that hand-wrote
   * `status:` would otherwise appear twice in the published note, and Obsidian
   * reads the first — which would be the stale one.
   */
  const kept = frontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const key = /^([A-Za-z0-9_]+):/.exec(line);
      return !key || !PROVENANCE_KEYS.includes(key[1]);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const id = deriveSourceId(frontmatter, filename);
  const status = deriveStatus(frontmatter);
  const modules = deriveModules(frontmatter);

  const provenance = [
    'generated: true',
    `node_type: ${nodeType}`,
    `source_id: ${id}`,
    `source_path: ${sourcePath}`,
    `source_commit: ${sourceCommit || 'UNTRACKED'}`,
    `status: ${status}`,
    `last_verified: ${lastVerified || ''}`,
    `modules: [${modules.join(', ')}]`,
  ].join('\n');

  const head = kept ? `${kept}\n${provenance}` : provenance;

  /*
   * A source with no frontmatter gains one. That is a real change to the note,
   * and it is the point: a note without provenance cannot be verified against
   * anything, so "leave it alone" would mean permanently exempting exactly the
   * notes nobody has curated.
   */
  const rest = hadFrontmatter ? body : source;
  return `---\n${head}\n---\n${rest.startsWith('\n') ? rest.slice(1) : rest}`;
}

/** Read the provenance back out of a published note. */
export function readProvenance(text) {
  const { frontmatter } = splitNote(text);
  if (!frontmatter) return null;
  if (!/^generated:\s*true\s*$/m.test(frontmatter)) return null;

  return {
    nodeType: readKey(frontmatter, 'node_type'),
    sourceId: readKey(frontmatter, 'source_id'),
    sourcePath: readKey(frontmatter, 'source_path'),
    sourceCommit: readKey(frontmatter, 'source_commit'),
    status: readKey(frontmatter, 'status'),
    lastVerified: readKey(frontmatter, 'last_verified'),
    standaloneAllowed: /^STANDALONE_ALLOWED:\s*true\s*$/m.test(frontmatter),
    standaloneReason: readKey(frontmatter, 'STANDALONE_ALLOWED_REASON'),
    standaloneBy: readKey(frontmatter, 'STANDALONE_ALLOWED_BY'),
    standaloneAt: readKey(frontmatter, 'STANDALONE_ALLOWED_AT'),
  };
}

/**
 * The commit that last touched each tracked path, in one pass.
 *
 * One `git log` over the whole history rather than one call per file: at ~300
 * notes the per-file version takes minutes, and a verification step slow enough
 * to skip is one that gets skipped.
 */
export function lastCommitByPath(gitLogOutput) {
  const map = new Map();
  let sha = '';
  let date = '';

  for (const line of String(gitLogOutput).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const header = /^([0-9a-f]{7,40})\x00(\d{4}-\d{2}-\d{2})$/.exec(line);
    if (header) {
      sha = header[1];
      date = header[2];
      continue;
    }
    /* First mention wins: git log is newest-first, so the first is the latest. */
    const path = line.trim();
    if (path && !map.has(path)) map.set(path, { sha, date });
  }

  return map;
}
