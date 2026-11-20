#!/usr/bin/env node
/**
 * Applies the verified incident dispositions to the platform monitoring queue
 * through the product's own audited route, `PATCH /platform/logs/events/:traceId`.
 *
 * Why a script the operator runs, and not something an agent runs: closing a
 * production incident is a platform-admin write. Nobody should have to paste an
 * admin session into a chat to get it done, and no agent should reach around the
 * API into the database — that would skip `AuditService.log`, which is the
 * record this workflow exists to preserve.
 *
 * Safe by construction:
 *   - DRY RUN unless `--apply` is passed.
 *   - Only rows whose disposition is CLOSE_AS_EXPECTED or CLOSE_AS_RESOLVED are
 *     ever written. KEEP_OPEN_* (security signals, client-render rows needing
 *     verification, the configuration gap, the review set) are never touched.
 *   - Each row is re-read first. It is skipped, and left open, when it is no
 *     longer unresolved, or when it has occurred again since the disposition was
 *     computed (a "resolved" defect that is still firing is not resolved).
 *   - Status moves to RESOLVED with an internal note naming the category; the
 *     row, its occurrences and every audit event are kept.
 *
 * Usage (PowerShell, in your own shell — the token never leaves it):
 *   $env:DP_API_URL   = "https://api.dijipeople.com/api"
 *   $env:DP_ADMIN_TOKEN = "<platform admin access token>"   # or DP_ADMIN_EMAIL + DP_ADMIN_PASSWORD when MFA is off
 *   node scripts/apply-incident-dispositions.mjs            # dry run
 *   node scripts/apply-incident-dispositions.mjs --apply
 */
import { readFileSync } from "node:fs";

const CSV = "docs/qa/runs/2026-11-19-growth-demo-incident-dispositions.csv";
const WRITABLE = new Set(["CLOSE_AS_EXPECTED", "CLOSE_AS_RESOLVED"]);
const apply = process.argv.includes("--apply");
const api = (process.env.DP_API_URL ?? "").replace(/\/$/, "");
if (!api) throw new Error("Set DP_API_URL (for example https://api.dijipeople.com/api).");

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

async function token() {
  if (process.env.DP_ADMIN_TOKEN) return process.env.DP_ADMIN_TOKEN;
  const { DP_ADMIN_EMAIL: email, DP_ADMIN_PASSWORD: password } = process.env;
  if (!email || !password) throw new Error("Set DP_ADMIN_TOKEN, or DP_ADMIN_EMAIL and DP_ADMIN_PASSWORD.");
  const res = await fetch(`${api}/admin/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-dijipeople-app": "admin" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  const t = body.accessToken ?? body.data?.accessToken;
  if (!t) throw new Error("Login did not return an access token (MFA enabled? use DP_ADMIN_TOKEN).");
  return t;
}

const auth = { authorization: `Bearer ${await token()}`, "x-dijipeople-app": "admin", "content-type": "application/json" };
const wanted = parseCsv(readFileSync(CSV, "utf8")).filter((r) => WRITABLE.has(r.recommended_disposition));
const byId = new Map(wanted.map((r) => [r.incident_id, r]));
console.log(`${wanted.length} rows are eligible to close; ${apply ? "APPLYING" : "dry run"}.`);

// Read the live open queue page by page and match by incident id.
const live = [];
for (let page = 1; ; page++) {
  const res = await fetch(`${api}/platform/logs/events?viewKey=open&pageSize=100&page=${page}`, { headers: auth });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  const body = await res.json();
  const data = body.data ?? body;
  live.push(...data.items);
  if (page >= data.meta.totalPages) break;
}

const tally = { closed: 0, wouldClose: 0, skippedGone: 0, skippedRecurred: 0, failed: 0 };
for (const [id, row] of byId) {
  const item = live.find((l) => l.id === id);
  if (!item) { tally.skippedGone++; continue; }
  const sinceCsv = new Date(item.lastSeenAt) > new Date(row.last_seen) || item.occurrenceCount > Number(row.occurrences);
  if (sinceCsv) { tally.skippedRecurred++; console.log(`kept open (recurred since triage): ${id} ${row.category}`); continue; }
  if (!apply) { tally.wouldClose++; continue; }
  const res = await fetch(`${api}/platform/logs/events/${encodeURIComponent(item.traceId)}`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({
      supportStatus: "RESOLVED",
      internalNote: `Triage ${row.category} (${row.recommended_disposition}): ${row.evidence}. See docs/qa/runs/2026-11-19-growth-demo-incident-triage-3a70554.md.`,
    }),
  });
  if (res.ok) tally.closed++; else { tally.failed++; console.log(`FAILED ${id}: ${res.status}`); }
}
console.log(tally);
