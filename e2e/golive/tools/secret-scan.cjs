#!/usr/bin/env node
/**
 * Secret scan for QA evidence: node secret-scan.cjs <dir> [<dir>...]   (exit 1 when anything is found)
 * Scans text files (reports, JSON results, traces' text parts, logs, docs) for
 *   - the per-run dummy SMTP credential (qa-dummy-secret-*)
 *   - credentials embedded in URLs (user and password before the host in a URL), except localhost sinks without a password
 *   - "password"/"secret"/"token"/"apiKey" JSON members holding a non-empty value, and Authorization/Cookie header values
 *   - the contents of the QA password if QA_PASSWORD is set in the environment or .env.qa.local
 * Binary files (png, zip, webm) are scanned as latin1 for the exact QA password and dummy secret only. Findings print path + rule, NEVER the secret.
 */
const fs = require('fs');
const path = require('path');
const dirs = process.argv.slice(2);
if (!dirs.length) { console.error('usage: secret-scan.cjs <dir>...'); process.exit(2); }

const exact = [];
try {
  const f = path.join(__dirname, '..', '..', '..', '.env.qa.local');
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = /^(QA_PASSWORD|QA_[A-Z_]*SECRET[A-Z_]*|QA_SMTP_PASS[A-Z_]*)=(.+)$/.exec(l); if (m && m[2].length >= 6) exact.push(m[2]); }
} catch { /* optional */ }
if (process.env.QA_PASSWORD && process.env.QA_PASSWORD.length >= 6) exact.push(process.env.QA_PASSWORD);

const rules = [
  ['dummy-smtp-secret', /qa-dummy-secret-[a-z0-9-]+/i],
  ['url-credentials', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]{3,}@/i],
  ['json-secret-member', /"(?:password|passwd|secret|smtpPassword|apiKey|api_key|accessToken|refreshToken|clientSecret)"\s*:\s*"(?!\*+"|\[redacted\]|")[^"]{4,}"/i],
  ['auth-header-value', /\b(?:authorization|cookie|set-cookie)["']?\s*[:=]\s*["']?(?:bearer\s+[a-z0-9._-]{20,}|[a-z_]*(?:token|session)[a-z_]*=[a-z0-9._-]{20,})/i],
];
const TEXT = /\.(json|md|txt|log|html|csv|cjs|mjs|js|ts|ps1|yml|yaml|xml|eml)$/i;
const SKIP = /(^|[\\/])(node_modules|\.git|\.auth)([\\/]|$)/;
let findings = 0, files = 0;
function walk(p) {
  if (SKIP.test(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) return fs.readdirSync(p).forEach((n) => walk(path.join(p, n)));
  if (st.size > 50 * 1024 * 1024) return;
  files++;
  const text = TEXT.test(p);
  const body = fs.readFileSync(p, text ? 'utf8' : 'latin1');
  if (text) for (const [name, re] of rules) if (re.test(body)) { findings++; console.log(`FOUND ${name}: ${p}`); }
  for (const s of exact) if (body.includes(s)) { findings++; console.log(`FOUND exact-qa-secret: ${p}`); }
  if (!text && /qa-dummy-secret-/.test(body)) { findings++; console.log(`FOUND dummy-smtp-secret (binary): ${p}`); }
}
for (const d of dirs) if (fs.existsSync(d)) walk(d); else console.log(`skip (missing): ${d}`);
console.log(`secret-scan: ${files} files, ${findings} finding(s)`);
process.exit(findings ? 1 : 0);
