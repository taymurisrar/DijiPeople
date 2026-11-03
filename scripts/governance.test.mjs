// Proves the engineering-governance layer is internally consistent (policy AGT-003, DOC-001).
// A rule nobody can find, an agent with an invalid tool, a policy pointing at a file that no
// longer exists, or two policies saying the same thing are all failures — instruction rot is
// the failure mode of every agent framework, and prose cannot detect it.
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const catalogue = JSON.parse(read('docs/engineering/policy-catalogue.json'));
const VALID_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Bash', 'PowerShell', 'Edit', 'Write', 'WebFetch', 'WebSearch', 'NotebookEdit']);
const LEVELS = ['MANDATORY', 'RECOMMENDED', 'EXCEPTION_ADR'];
const KINDS = ['executable', 'hook', 'review', 'manual'];

function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  assert.ok(m, 'missing frontmatter');
  const out = {};
  for (const l of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(l);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

test('policy catalogue: unique ids, valid level/kind, targets exist, manual needs a reason', () => {
  const ids = new Set();
  for (const p of catalogue.policies) {
    assert.match(p.id, /^[A-Z]+-\d{3}$/, p.id);
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`);
    ids.add(p.id);
    assert.ok(LEVELS.includes(p.level), `${p.id} level`);
    assert.ok(KINDS.includes(p.enforcement.kind), `${p.id} kind`);
    assert.ok(p.statement.length > 25, `${p.id} statement`);
    if (p.enforcement.kind === 'manual') assert.ok(p.enforcement.reason?.length > 20, `${p.id} manual needs a reason`);
    else assert.ok(exists(p.enforcement.ref), `${p.id} enforcement target missing: ${p.enforcement.ref}`);
  }
});

test('critical governance rules are executable or hook-enforced, not prose', () => {
  const critical = ['API-001', 'API-002', 'API-003', 'API-004', 'SEC-001', 'MOD-001', 'MOD-002', 'DB-001', 'GIT-001', 'GIT-002', 'CI-002', 'HOT-001', 'HOT-003', 'HOT-005'];
  for (const id of critical) {
    const p = catalogue.policies.find((x) => x.id === id);
    assert.ok(p, id);
    assert.ok(['executable', 'hook'].includes(p.enforcement.kind), `${id} must be machine-enforced, is ${p.enforcement.kind}`);
  }
});

test('no two policies state the same thing (duplicate detection)', () => {
  const norm = (s) => new Set(s.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter((w) => w.length > 3));
  const ps = catalogue.policies;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const a = norm(ps[i].statement), b = norm(ps[j].statement);
      const inter = [...a].filter((w) => b.has(w)).length;
      const jac = inter / (a.size + b.size - inter);
      assert.ok(jac < 0.7, `${ps[i].id} and ${ps[j].id} are near-duplicates (${jac.toFixed(2)})`);
    }
});

test('every policy id referenced by code or docs exists in the catalogue', () => {
  const ids = new Set(catalogue.policies.map((p) => p.id));
  const files = ['scripts/check-api-completeness.mjs', 'scripts/check-module-completeness.mjs', 'scripts/hotfix.mjs', 'scripts/ci-doctor.mjs', 'scripts/lessons.mjs', 'scripts/preflight.mjs', 'scripts/hooks/guard-bash.mjs']
    .concat(fs.readdirSync(path.join(ROOT, '.claude/rules')).map((f) => `.claude/rules/${f}`));
  for (const f of files) {
    for (const m of read(f).matchAll(/\b(API|MOD|SEC|DB|GIT|CI|HOT|AGT|LRN|UI|PERF|DOC)-(\d{3})\b/g)) {
      // guard-bash has its own rule ids that intentionally mirror (GIT-00x, DB-00x, CI-00x) but may be a subset
      if (f.endsWith('guard-bash.mjs') && ['FS', 'DEPLOY'].includes(m[1])) continue;
      assert.ok(ids.has(m[0]) || f.endsWith('guard-bash.mjs') || f.endsWith('ci-doctor.mjs'), `${f} cites unknown policy ${m[0]}`);
    }
  }
});

test('agents: valid frontmatter, filename = name, only known tools, QA/security agents cannot edit source', () => {
  const dir = '.claude/agents';
  const files = fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 10, `expected >=10 agents, found ${files.length}`);
  for (const f of files) {
    const fm = frontmatter(read(`${dir}/${f}`));
    assert.equal(fm.name, f.replace(/\.md$/, ''), f);
    assert.match(fm.name, /^dp-[a-z-]+$/);
    assert.ok(fm.description.length > 40, `${f} description`);
    for (const t of fm.tools.split(',').map((s) => s.trim())) assert.ok(VALID_TOOLS.has(t), `${f}: unknown tool ${t}`);
    assert.ok(['opus', 'sonnet', 'haiku', 'inherit'].includes(fm.model), `${f} model`);
  }
  for (const independent of ['dp-qa-engineer', 'dp-security-reviewer']) {
    const tools = frontmatter(read(`${dir}/${independent}.md`)).tools;
    assert.doesNotMatch(tools, /\bEdit\b/, `${independent} must not be able to edit source (AGT-002)`);
  }
});

test('skills: required set exists, each names an existing lead agent, side-effecting ones are manual-only', () => {
  const required = ['dp-new-module', 'dp-new-api', 'dp-implement-feature', 'dp-fix-bug', 'dp-review', 'dp-test', 'dp-ci-doctor', 'dp-hotfix', 'dp-release-check', 'dp-security-audit', 'dp-learn'];
  for (const s of required) {
    assert.ok(exists(`.claude/skills/${s}/SKILL.md`), `skill ${s} missing`);
    const text = read(`.claude/skills/${s}/SKILL.md`);
    const fm = frontmatter(text);
    assert.equal(fm.name, s);
    assert.ok(fm.description.length > 30);
    const lead = /Lead agent: `([^`]+)`/.exec(text)?.[1];
    assert.ok(lead && exists(`.claude/agents/${lead}.md`), `${s} lead agent ${lead}`);
  }
  for (const s of ['dp-hotfix', 'dp-release-check', 'dp-security-audit'])
    assert.equal(frontmatter(read(`.claude/skills/${s}/SKILL.md`))['disable-model-invocation'], 'true', `${s} must not be auto-invoked`);
});

test('rules are path-scoped and reference the catalogue', () => {
  for (const f of fs.readdirSync(path.join(ROOT, '.claude/rules'))) {
    const t = read(`.claude/rules/${f}`);
    assert.match(t, /^---\r?\npaths:/, `${f} needs paths frontmatter so it loads only when relevant`);
    assert.match(t, /policy-catalogue\.json/);
  }
});

test('settings: hooks point at existing scripts; deny list protects main, force-push and prod DB', () => {
  const s = JSON.parse(read('.claude/settings.json'));
  for (const group of Object.values(s.hooks)) for (const g of group) for (const h of g.hooks) {
    const script = /scripts\/hooks\/[\w.-]+\.mjs/.exec(h.command)?.[0];
    assert.ok(script && exists(script), `hook script missing: ${h.command}`);
  }
  const deny = s.permissions.deny.join('\n');
  for (const needle of ['git push --force', 'git push origin main', 'migrate reset', 'db push']) assert.ok(deny.includes(needle), needle);
  assert.ok(!s.permissions.allow.some((a) => /deploy|vercel|render|push/.test(a)), 'allow list must not grant deploy/push');
});

test('root instructions stay concise and point at the layers (progressive disclosure)', () => {
  const claude = read('CLAUDE.md');
  assert.ok(claude.split('\n').length < 60, 'CLAUDE.md must stay a short entrypoint');
  assert.match(claude, /docs\/engineering\/README\.md|policy-catalogue/);
});

test('machine-readable manifests referenced by gates exist', () => {
  for (const f of ['docs/engineering/api-resource-contracts.json', 'docs/engineering/module-creation-entrypoints.json']) JSON.parse(read(f));
});

test('CI-006: ci.yml installs only through the shared setup action, which pins node and npm from package.json', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.doesNotMatch(ci, /^\s*-\s*run:\s*npm ci\s*$/m, 'a job installs with a bare "npm ci"; use ./.github/actions/setup-npm');
  assert.ok((ci.match(/uses: \.\/\.github\/actions\/setup-npm/g) ?? []).length >= 10, 'the shared action is used by the install jobs');
  const action = read('.github/actions/setup-npm/action.yml');
  assert.match(action, /packageManager/, 'npm version comes from package.json packageManager, not a hard-coded literal');
  assert.match(action, /engines\.node/, 'node major comes from package.json engines');
  const verify = action.indexOf('Verify toolchain before installing dependencies');
  const install = action.indexOf('Clean install');
  assert.ok(verify > 0 && install > verify, 'versions are verified BEFORE npm ci');
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.packageManager, /^npm@\d+\.\d+\.\d+$/);
  assert.equal(pkg.engines.npm.split('.')[0], pkg.packageManager.split('@')[1].split('.')[0], 'packageManager and engines.npm agree on the major');
});

test('CI-006: the framework validation job fetches full history; other jobs keep the default shallow checkout', () => {
  const ci = read('.github/workflows/ci.yml');
  const validate = ci.slice(ci.indexOf('  validate:'), ci.indexOf('  typecheck:'));
  assert.match(validate, /fetch-depth: 0/);
  assert.equal((ci.match(/fetch-depth: 0/g) ?? []).length, 1, 'only the job that needs ancestry gets full history');
});

test('CI-007: dependabot targets develop, has exactly one npm entry at the root, and groups updates', () => {
  // Dependency-free on purpose: governance.yml runs without npm ci, so no YAML parser is available.
  const text = read('.github/dependabot.yml');
  assert.match(text, /^version: 2$/m);
  const ecosystems = [...text.matchAll(/^\s*- package-ecosystem: (\S+)/gm)].map((m) => m[1]);
  assert.equal(ecosystems.filter((e) => e === 'npm').length, 1, 'a second npm entry re-creates the duplicate-PR problem');
  const targets = [...text.matchAll(/^\s*target-branch: (\S+)/gm)].map((m) => m[1]);
  assert.equal(targets.length, ecosystems.length, 'every update entry names its target branch');
  assert.ok(targets.every((t) => t === 'develop'), 'every entry must target develop, never production');
  const npmBlock = text.slice(text.indexOf('- package-ecosystem: npm'), text.indexOf('- package-ecosystem: github-actions'));
  assert.match(npmBlock, /^\s*directory: \/$/m, 'the single npm entry is the repository root');
  assert.ok((npmBlock.match(/^\s{6}[a-z-]+:\n\s{8}applies-to:/gm) ?? []).length >= 2, 'security and routine updates are grouped');
  const cap = Number(/open-pull-requests-limit: (\d+)/.exec(npmBlock)?.[1]);
  assert.ok(cap > 0 && cap <= 10);
});

test('scripts whose JSON is consumed through a pipe must flush before exit (Linux truncates at 64 KiB)', () => {
  // Found in CI: backlog-review printed ~165 KB then called process.exit(); on a Linux pipe the output was
  // cut at the 64 KiB buffer, so validate-framework simulations 26b/61/61b failed there and nowhere else.
  const bounded = new Set(['agent-health.mjs', 'check-overrides-applied.mjs', 'check-render-config.mjs', 'evidence.mjs', 'hotfix-rehearsal.mjs', 'hotfix.mjs', 'repo-health.mjs', 'verify-branch-policy.mjs']); // small, bounded output
  const offenders = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts')).filter((n) => n.endsWith('.mjs'))) {
    const src = read('scripts/' + f).replace(/\r\n/g, '\n');
    if (/console\.log\(JSON\.stringify\([^\n]*\)\);?\n\s*process\.exit\(/.test(src) && !bounded.has(f)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], 'wait for process.stdout.write to drain before process.exit');
  assert.match(read('scripts/backlog-review.mjs'), /process\.stdout\.write\(JSON\.stringify\(report/);
});
