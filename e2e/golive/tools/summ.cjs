// Prints status counts and failure messages of Playwright JSON result files. Usage: node summ.cjs <file...>
const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8')); const c = {};
  const walk = (s) => { for (const sp of s.specs || []) for (const t of sp.tests) { const r = t.results[t.results.length - 1]; const st = t.status === 'skipped' ? 'skipped' : r.status; c[st] = (c[st] || 0) + 1; if (['failed', 'timedOut'].includes(r.status)) { console.log('##', (sp.title.match(/DPQA-[A-Z0-9-]+/) || [sp.title.slice(0, 50)])[0], t.projectName); console.log((r.error?.message || '').replace(/\u001b\[[0-9;]*m/g, '').slice(0, +process.env.W || 600)); } } for (const x of s.suites || []) walk(x); };
  for (const s of j.suites) walk(s); console.log(f, JSON.stringify(c));
}
