// RUN-008: collects the measurement / observation / evidence annotations of the FINAL attempt of every test into docs/qa/go-live/evidence/RUN008-measurements.md.
const fs = require('fs'); const dir = 'e2e/golive-results/run008/merged'; const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => /^results-.*\.json$/.test(x))) {
  const j = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  for (const s of j.suites) for (const sp of s.specs) for (const t of sp.tests) {
    const id = (sp.title.match(/DPQA-[A-Z0-9-]+/) || [''])[0];
    for (const a of t.annotations || []) if (['measurement', 'observation', 'owner-decision', 'evidence', 'findings', 'not-run'].includes(a.type)) rows.push({ project: t.projectName, id, type: a.type, d: (a.description || '').replace(/\s+/g, ' ').slice(0, 520) });
  }
}
rows.sort((a, b) => (a.id + a.project).localeCompare(b.id + b.project));
const md = ['# RUN-008 measurements and observations (final attempt of each test)', '', 'Extracted by QA from the Playwright annotations of the merged final results (`e2e/golive-results/run008/merged`). Values were measured on the local isolated stack; response bodies are truncated and carry no credentials.', '', '| Test | Project | Kind | Annotation |', '|---|---|---|---|', ...rows.map((r) => `| ${r.id} | ${r.project} | ${r.type} | ${r.d.replace(/\|/g, '\|')} |`)];
fs.writeFileSync('docs/qa/go-live/evidence/RUN008-measurements.md', md.join('\n'));
console.log(rows.length, 'annotations');
