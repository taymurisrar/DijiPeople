/**
 * Drive the new Platform Admin legal endpoints end to end.
 *
 * Proves the whole authoring loop against a running API: list the documents,
 * read a draft, see *why* it cannot be published, edit it to remove the review
 * banner, watch the blockers clear, publish, and confirm the public endpoint
 * now serves it.
 *
 * Local and disposable only — publishing is irreversible (a published version is
 * immutable by design), so this refuses anything that is not a throwaway.
 */
import fs from 'node:fs';

const API = process.argv[2] ?? 'http://localhost:4001/api';

if (/dijipeople\.com/i.test(API)) {
  console.error('REFUSING: this publishes legal documents. Not against production.');
  process.exit(1);
}

function envValue(key) {
  const file = fs.readFileSync(new URL('../../services/api/.env', import.meta.url), 'utf8');
  return file.match(new RegExp(`^${key}="?([^"\\n\\r]*)"?`, 'm'))?.[1] ?? null;
}

async function call(path, init = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-DijiPeople-App': 'admin', ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
}

const login = await call('/admin/auth/login', {
  method: 'POST',
  body: JSON.stringify({
    email: envValue('BOOTSTRAP_ADMIN_EMAIL'),
    password: envValue('BOOTSTRAP_ADMIN_PASSWORD'),
  }),
});
const token = login.body?.accessToken ?? login.body?.tokens?.accessToken;
if (!token) {
  console.error('login failed:', login.status, JSON.stringify(login.body).slice(0, 300));
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}` };

console.log('1. GET /super-admin/legal/documents');
const list = await call('/super-admin/legal/documents', { headers: auth });
if (list.status !== 200) {
  console.error('   failed:', list.status, JSON.stringify(list.body).slice(0, 300));
  process.exit(1);
}
console.log(`   ${list.body.length} document(s)`);
for (const document of list.body.slice(0, 3)) {
  console.log(
    `     ${document.slug.padEnd(16)} versions=${document.versions.length}` +
      ` draft=${document.draftVersion ? 'v' + document.draftVersion.version : 'none'}` +
      ` published=${document.publishedVersion ? 'v' + document.publishedVersion.version : 'none'}`,
  );
}

const target = list.body.find((document) => document.slug === 'cookie-policy') ?? list.body[0];
const draftId = target.draftVersion?.id;
if (!draftId) {
  console.error('no draft to work with');
  process.exit(1);
}

console.log(`\n2. GET the draft for "${target.slug}"`);
const version = await call(`/super-admin/legal/versions/${draftId}`, { headers: auth });
console.log('   status      :', version.body.status);
console.log('   length      :', version.body.contentMarkdown.length, 'chars');
console.log('   blockers    :', version.body.publishBlockers);

console.log('\n3. PATCH it with the review banner removed');
const cleaned = version.body.contentMarkdown
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('>'))
  .join('\n');
const updated = await call(`/super-admin/legal/versions/${draftId}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ contentMarkdown: cleaned, changeSummary: 'Reviewed copy' }),
});
console.log('   status      :', updated.status);
console.log('   blockers now:', updated.body.publishBlockers);

console.log('\n4. POST publish');
const published = await call(`/super-admin/legal/versions/${draftId}/publish`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({}),
});
console.log('   status      :', published.status, '| version status:', published.body?.status);

console.log('\n5. GET /public/legal — is it served publicly now?');
const publicIndex = await call('/public/legal');
const documents = publicIndex.body?.documents ?? [];
console.log(`   ${documents.length} published document(s):`, documents.map((d) => d.slug).join(', ') || '(none)');

console.log('\n6. Immutability — PATCH the now-published version');
const refused = await call(`/super-admin/legal/versions/${draftId}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ contentMarkdown: 'rewriting history' }),
});
console.log('   status      :', refused.status, '(expect 4xx)');
console.log('   message     :', refused.body?.message ?? JSON.stringify(refused.body).slice(0, 160));
