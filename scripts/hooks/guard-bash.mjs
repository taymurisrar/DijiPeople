#!/usr/bin/env node
// PreToolUse hook (matcher: Bash, PowerShell). Reads the hook JSON on stdin and
// exits 2 (block, message on stderr) for commands this repository has already
// been hurt by. Prose rules get forgotten under pressure; this cannot be.
//
// Every rule names the incident or policy it enforces. Adding a rule needs a
// test in scripts/hooks/guard-bash.test.mjs; removing one needs an ADR.
import { pathToFileURL } from 'node:url';

export const RULES = [
  {
    id: 'GIT-001',
    why: 'main is production: a push or merge there deploys. Ordinary work targets develop (AGENTS.md "Branches").',
    test: (c) => /\bgit\s+push\b[^\n;|&]*\b(origin\s+)?(\S+:)?main\b(?!-)/.test(c) && !/--dry-run/.test(c),
  },
  {
    id: 'GIT-002',
    why: 'Force-pushing discards unverified commits (protected-branch recovery rule).',
    test: (c) => /\bgit\s+push\b[^\n;|&]*(--force\b|--force-with-lease\b|\s-f\b)/.test(c),
  },
  {
    id: 'GIT-003',
    why: '`git checkout -- <file>` / `git restore` / `reset --hard` destroy uncommitted edits, incl. other sessions\' work. Copy the file first or use a worktree.',
    test: (c) => /\bgit\s+checkout\s+(--\s|\.\s*$)/.test(c) || /\bgit\s+restore\b(?![^\n]*--staged)/.test(c) || /\bgit\s+reset\s+--hard\b/.test(c) || /\bgit\s+clean\s+-[a-z]*f/.test(c),
  },
  {
    id: 'GIT-004',
    why: '`git worktree remove` follows node_modules junctions and deleted thousands of tracked files. Use `npm run worktree:remove`.',
    test: (c) => /\bgit\s+worktree\s+remove\b/.test(c),
  },
  {
    id: 'GIT-005',
    why: 'Never stash: worktrees are shared with subagents and a stash sweeps up their edits.',
    test: (c) => /\bgit\s+stash\b(?!\s+(list|show))/.test(c),
  },
  {
    id: 'FS-001',
    why: 'Recursive delete follows junctions into the primary checkout. Use `npm run worktree:remove`, and `cmd /c rmdir` for a junction.',
    test: (c) => /Remove-Item\b[^\n]*-Recurse/i.test(c) || /\brm\s+-[a-z]*r[a-z]*f?\s+[^\n]*(node_modules|\.git\b|^\/|[A-Za-z]:[\\/])/i.test(c),
  },
  {
    id: 'DB-001',
    why: 'migrate reset / db push / drop against a shared database destroys tenant data (prisma/AGENTS.md).',
    test: (c) => /prisma\s+(migrate\s+reset|db\s+push)\b/.test(c) || /\bDROP\s+(DATABASE|SCHEMA|TABLE)\b/i.test(c) || /\bTRUNCATE\b/i.test(c),
  },
  {
    id: 'DB-002',
    why: 'seed:commercial would rewrite production prices (see memory seed-commercial-would-rewrite-production-prices).',
    test: (c) => /seed:commercial\b/.test(c),
  },
  {
    id: 'DEPLOY-001',
    why: 'Production deploys, env changes and service updates need explicit owner approval (hotfix workflow step 12).',
    test: (c) => /\b(vercel\s+(deploy|--prod|env\s+(add|rm))|render\s+(deploys?|services?\s+update)|gh\s+workflow\s+run\s+(release|deploy|agent-auto-release))/i.test(c),
  },
  {
    id: 'CI-001',
    why: 'Never bypass hooks, signing or required checks to get a green build.',
    test: (c) => /--no-verify\b|--no-gpg-sign\b|-c\s+commit\.gpgsign=false/.test(c),
  },
  {
    id: 'CI-002',
    why: 'Warning budgets and required checks are never loosened to obtain green (policy CI-004). Raise a reviewed ADR instead.',
    test: (c) => /--max-warnings[= ]\d+/.test(c) && /\b(sed|perl|awk)\b|>>?\s*\S*(ci\.yml|package\.json)/.test(c),
  },
];

export function evaluate(command) {
  const c = String(command ?? '');
  return RULES.filter((r) => r.test(c)).map(({ id, why }) => ({ id, why }));
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    process.exit(0); // never block on a malformed envelope
  }
  const command = input?.tool_input?.command;
  if (!command) process.exit(0);
  const hits = evaluate(command);
  if (!hits.length) process.exit(0);
  process.stderr.write(
    'BLOCKED by DijiPeople guard hook:\n' +
      hits.map((h) => `  [${h.id}] ${h.why}`).join('\n') +
      '\nIf this is genuinely required, ask the owner; do not rephrase the command to slip past the guard.\n',
  );
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
