// Runs SQL statements against an explicit LOCAL throwaway database URL. Usage: node sqlurl.cjs <url> "<sql>" ["<sql>"...]   (url must be localhost and end _test, or be the maintenance database `postgres` on localhost for create/drop)
const { Client } = require('pg');
const [url, ...stmts] = process.argv.slice(2);
if (!/@localhost[:/]/.test(url) || !/(_test|\/postgres)$/.test(url)) throw new Error('refusing: not a local throwaway database');
(async () => { const c = new Client({ connectionString: url }); await c.connect(); for (const q of stmts) { const r = await c.query(q); console.log(JSON.stringify(r.rows.length ? r.rows : { rowCount: r.rowCount })); } await c.end(); })().catch((e) => { console.error(e.message); process.exit(1); });
