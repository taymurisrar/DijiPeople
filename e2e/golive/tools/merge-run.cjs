// Builds the per-project result files for a run report from a full execution plus later targeted re-runs.
// A full execution (run004/final/results-<project>.json) is the base; any spec that was RE-RUN afterwards after a test-side correction
// (run004/results-chromium-subsetN.json, later N wins) replaces the base row for the same project + title. The report states this.
// Usage: node merge-run.cjs <runDir> <outDir> [subset files...]
const fs = require('fs'); const path = require('path');
const [runDir, outDir, ...subsets] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const specsOf = (suites, acc = []) => { for (const s of suites ?? []) { for (const sp of s.specs ?? []) acc.push(sp); specsOf(s.suites, acc); } return acc; };
const replaced = [];
// Match on the stable test id when the title carries one: a spec whose TITLE was corrected after the full execution (justified contract change)
// must replace its old row, not sit beside it as a stale failure.
const keyOf = (proj, title) => `${proj}|${(title.match(/\[(DPQA-[A-Z0-9-]+)\]/) || [, title])[1]}`;
for (const f of fs.readdirSync(runDir).filter((x) => /^results-.+\.json$/.test(x))) {
  const base = load(path.join(runDir, f));
  const project = f.replace(/^results-|.json$/g, '');
  const byKey = new Map();
  for (const sp of specsOf(base.suites)) for (const t of sp.tests) byKey.set(keyOf(t.projectName, sp.title), { sp, t });
  for (const sf of subsets) {
    const sub = load(sf);
    for (const sp of specsOf(sub.suites)) for (const t of sp.tests) {
      if (t.projectName !== project) continue; // a re-run of one project must only touch that project's file
      const k = keyOf(t.projectName, sp.title);
      const hit = byKey.get(k);
      if (hit && !/SETUP/.test(sp.title)) { hit.t.results = t.results; hit.t.status = t.status; hit.sp.title = sp.title; /* the corrected title is the one reported */ replaced.push(`${t.projectName} ${sp.title.slice(0, 40)}`); }
      else if (!hit && !/SETUP/.test(sp.title) && base.suites[0]) { base.suites[0].specs.push(sp); byKey.set(k, { sp, t }); replaced.push(`+ ${t.projectName} ${sp.title.slice(0, 40)}`); }
    }
  }
  fs.writeFileSync(path.join(outDir, f), JSON.stringify(base));
}
console.log('rows replaced/added from re-runs:', replaced.length); fs.writeFileSync(path.join(outDir, 'REPLACED.txt'), replaced.join('\n'));
