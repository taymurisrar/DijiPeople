// RUN-007: merges the batch / group result files of one run into one file per project, LATEST attempt wins, and keeps the full attempt history of every test.
// A test that failed, was corrected (fixture) or re-run and then passed is therefore never reported as a clean pass: history.json lists every attempt in order and the report states which ones
// changed after a test-side correction. Legacy-migration results (results-legacy-<a|b|c>.json) are kept as separate pseudo-projects legacy-a/b/c.
// Usage (from e2e/): node golive/tools/merge-run007.cjs <runDir> <outDir>
const fs = require('fs'); const path = require('path');
const [runDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const files = fs.readdirSync(runDir).filter((f) => /^results-(chromium|firefox|webkit|mobile|tablet|legacy)-?.*\.json$/.test(f) && f !== 'results-merged.json')
  .map((f) => ({ f, t: fs.statSync(path.join(runDir, f)).mtimeMs })).sort((a, b) => a.t - b.t);
const specsOf = (suites, acc = []) => { for (const s of suites ?? []) { for (const sp of s.specs ?? []) acc.push(sp); specsOf(s.suites, acc); } return acc; };
const idOf = (title) => (title.match(/\[(DPQA-[A-Z0-9-]+)\]/) || [, null])[1];
const final = new Map(); const history = {};
let cfg = null;
for (const { f } of files) {
  const j = JSON.parse(fs.readFileSync(path.join(runDir, f), 'utf8')); cfg = cfg ?? j.config;
  const legacy = f.match(/^results-legacy-([abc])\.json$/);
  for (const sp of specsOf(j.suites)) for (const t of sp.tests) {
    const id = idOf(sp.title); if (!id || /^DPQA-SETUP/.test(id)) continue;
    const project = legacy ? `legacy-${legacy[1]}` : t.projectName;
    if (legacy && !/^DPQA-MIG-/.test(id)) continue;
    const r = t.results.at(-1); const st = !r ? 'notrun' : r.status === 'passed' ? 'pass' : r.status === 'skipped' ? 'skip' : 'FAIL';
    const key = `${project}|${id}`;
    (history[key] ??= []).push({ file: f, status: st, ms: r?.duration ?? 0, error: st === 'FAIL' ? (r.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').filter(Boolean).slice(0, 3).join(' | ').slice(0, 300) : undefined });
    // the LATEST attempt wins; a skip that follows a real result is reported in history.json and listed by the report (serial-mode skips and 'not offered by this build' skips both look like this)
    final.set(key, { sp, t: { ...t, projectName: project }, st });
  }
}
const byProject = {};
for (const [key, v] of final) { const p = key.split('|')[0]; (byProject[p] ??= []).push({ ...v.sp, tests: [v.t] }); }
for (const [p, specs] of Object.entries(byProject)) fs.writeFileSync(path.join(outDir, `results-${p}.json`), JSON.stringify({ config: cfg, stats: { duration: 0 }, suites: [{ title: p, specs, suites: [] }] }));
fs.writeFileSync(path.join(outDir, 'history.json'), JSON.stringify(history, null, 1));
const changed = Object.entries(history).filter(([, h]) => new Set(h.map((x) => x.status)).size > 1);
console.log(`files ${files.length}; projects ${Object.keys(byProject).join(',')}; tests ${final.size}; with changing history ${changed.length}`);
