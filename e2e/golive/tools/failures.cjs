// Lists the failed tests of one or more Playwright JSON result files with the first lines of each error (evidence triage, no verdict).
// Usage: node failures.cjs <results.json> [more.json ...]
const fs = require('fs');
const walk = (ss, f) => { for (const s of ss ?? []) { for (const sp of s.specs ?? []) for (const t of sp.tests) f(sp, t); walk(s.suites, f); } };
for (const file of process.argv.slice(2)) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tally = { passed: 0, failed: 0, skipped: 0, other: 0 };
  walk(j.suites, (sp, t) => {
    const r = t.results.at(-1); const st = !r ? 'other' : r.status === 'passed' ? 'passed' : r.status === 'skipped' ? 'skipped' : r.status === 'failed' || r.status === 'timedOut' ? 'failed' : 'other';
    tally[st]++;
    if (st === 'failed') {
      const msg = (r.error?.message ?? r.errors?.[0]?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').filter(Boolean).slice(0, 6).join(' | ').slice(0, 520);
      console.log(`FAIL [${t.projectName}] ${sp.file}:${sp.line} ${sp.title}\n     ${msg}`);
    }
  });
  console.log(`-- ${file}: ${JSON.stringify(tally)}`);
}
