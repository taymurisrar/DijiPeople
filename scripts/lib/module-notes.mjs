/*
 * Resolving a declared module to the knowledge note that documents it.
 *
 * Shared by `rebuild-backlog.mjs`, which turns a record's `AffectedModules` into
 * graph edges, and `generate-record-graph.mjs`, which does the same for a
 * session's `AFFECTED_MODULES`. It lives here rather than in either script
 * because two copies of a name table drift, and a drifted copy produces a dead
 * wikilink — which renders as ordinary text and announces nothing. The same
 * reasoning that put the Obsidian mapping table in `obsidian-mappings.mjs`.
 *
 * `validate-framework.mjs` checks every right-hand value below resolves to a
 * real note.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Where a code directory and its knowledge note disagree on the name.
 *
 * This is a DECLARED table, not fuzzy matching, and the difference matters. A
 * fuzzy match would pair "contracts" with "contracts-and-agreements" and also
 * pair "commercial-onboarding" with "commercial-onboarding-lifecycle" — one of
 * those is right and the other is a different subject, and neither the matcher
 * nor the reader can tell which. Every entry here was checked by opening the
 * note; anything not listed gets no edge rather than a plausible wrong one.
 *
 * The right-hand side must be a real note in docs/knowledge/modules or
 * docs/knowledge/architecture. A typo here produces a dead link, so
 * `validate-framework.mjs` checks the table resolves.
 */
export const MODULE_NOTE_ALIASES = new Map([
  /* Directory                    Note that documents it */
  ['contracts', 'contracts-and-agreements'],
  ['tenant-settings', 'settings'],
  ['settings-runtime', 'settings'],
  ['tenant-domains', 'workspace-routing-and-domains'],
  ['partner-experience', 'partners'],
  ['platform-events', 'audit-and-events'],
  ['audit', 'audit-and-events'],
  ['super-admin', 'super-admin'],
  ['tenants', 'tenant-control-plane'],

  /* The product surfaces. Each note is the one that documents that surface. */
  ['web', 'tenant-application'],
  ['admin', 'platform-admin'],
  ['landing', 'landing-architecture'],
  ['agent-desktop', 'desktop-agent-architecture'],
  ['api', 'api-architecture'],
  ['prisma', 'database-architecture'],
  ['gateway', 'desktop-api-gateway-relationship'],
  ['e2e', 'qa-and-ci-architecture'],
  ['ci', 'ci-architecture'],
  ['config', 'deployment-architecture'],
]);

/*
 * Both folders, deliberately.
 *
 * The lookup once read only `docs/knowledge/modules`, and every module note in
 * `docs/knowledge/architecture` was invisible to it — so records naming
 * `apps/landing`, `apps/web` and `services/api` got no edge at all. The
 * relationships were not missing and the notes were not missing; the lookup was
 * pointed at one of the two folders that hold them.
 */
export function moduleNoteNames(root) {
  return new Set(
    ['docs/knowledge/modules', 'docs/knowledge/architecture']
      .filter((dir) => existsSync(join(root, dir)))
      .flatMap((dir) =>
        readdirSync(join(root, dir))
          .filter((name) => name.endsWith('.md') && name !== 'README.md')
          .map((name) => name.replace(/\.md$/, '')),
      ),
  );
}

/** The note name for a declared module, or null when there is no exact match. */
export function resolveModuleNote(entry, names) {
  const cleaned = String(entry).trim().replace(/^(api|web|admin|pkg):/, '');
  const leaf = cleaned.split('/').filter(Boolean).pop() ?? '';
  if (names.has(leaf)) return leaf;
  if (names.has(cleaned)) return cleaned;

  const aliased = MODULE_NOTE_ALIASES.get(leaf) ?? MODULE_NOTE_ALIASES.get(cleaned);
  if (aliased && names.has(aliased)) return aliased;

  return null;
}
