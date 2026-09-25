#!/usr/bin/env node
/**
 * TASK-0032 WP-08 — Platform Admin CRUD matrix.
 *
 * Drives every `platform-runtime` module end to end over HTTP as each of
 * SUPER_ADMIN, PLATFORM_ADMIN, PLATFORM_OPERATIONS, a tenant admin and an
 * anonymous caller, and prints a Markdown matrix plus a findings list.
 *
 * This is a live-stack exerciser, not a unit test: it makes real writes
 * against the configured API and cleans up everything it creates, reporting
 * (rather than swallowing) anything it cannot clean up — per
 * `.agent/context/test-resource-policy.md`.
 *
 * Refuses to run unless the configured API host is localhost/127.0.0.1 — this
 * creates, edits and deletes real records and must never reach a shared or
 * production host by an environment-variable mistake.
 *
 * Configuration (env vars, all optional — sane localhost defaults below):
 *   ADMIN_CRUD_API_BASE                default http://localhost:4100/api
 *   ADMIN_CRUD_SUPER_ADMIN_EMAIL / _PASSWORD       (falls back to
 *     PLATFORM_SUPER_ADMIN_EMAIL / PLATFORM_SUPER_ADMIN_PASSWORD, which the
 *     repo already defines in services/api/.env)
 *   ADMIN_CRUD_PLATFORM_ADMIN_EMAIL / _PASSWORD
 *   ADMIN_CRUD_PLATFORM_OPERATIONS_EMAIL / _PASSWORD
 *   ADMIN_CRUD_TENANT_ADMIN_EMAIL / _PASSWORD      (falls back to the seeded
 *     demo tenant's system-admin@dijipeople.local)
 *   ADMIN_CRUD_TENANT_EMPLOYEE_EMAIL / _PASSWORD   (falls back to the seeded
 *     demo tenant's employee@dijipeople.local)
 *   ADMIN_CRUD_OUT_FILE                 optional path to also write the
 *                                        Markdown report to
 *
 * Usage: node e2e/tools/admin-crud-matrix.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");

const API_BASE = process.env.ADMIN_CRUD_API_BASE ?? "http://localhost:4100/api";

function requireLocalhost(base) {
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new Error(`ADMIN_CRUD_API_BASE is not a valid URL: ${base}`);
  }
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error(
      `Refusing to run: API host "${url.hostname}" is not localhost. ` +
        `This script creates, edits and deletes real records and must only ` +
        `ever target a local throwaway stack.`,
    );
  }
}
requireLocalhost(API_BASE);

/** Read a KEY="value" (or KEY=value) line out of services/api/.env. */
function envFileValue(key) {
  const envPath = path.join(REPO_ROOT, "services/api/.env");
  if (!fs.existsSync(envPath)) return null;
  const contents = fs.readFileSync(envPath, "utf8");
  const match = contents.match(new RegExp(`^${key}="?([^"\r\n]*)"?`, "m"));
  return match ? match[1] : null;
}

function env(key, fallback = null) {
  return process.env[key] ?? fallback;
}

const ROLE_CREDENTIALS = {
  SUPER_ADMIN: {
    email:
      env("ADMIN_CRUD_SUPER_ADMIN_EMAIL") ??
      env("PLATFORM_SUPER_ADMIN_EMAIL") ??
      envFileValue("PLATFORM_SUPER_ADMIN_EMAIL"),
    password:
      env("ADMIN_CRUD_SUPER_ADMIN_PASSWORD") ??
      env("PLATFORM_SUPER_ADMIN_PASSWORD") ??
      envFileValue("PLATFORM_SUPER_ADMIN_PASSWORD"),
    app: "admin",
    loginPath: "/admin/auth/login",
  },
  PLATFORM_ADMIN: {
    email:
      env("ADMIN_CRUD_PLATFORM_ADMIN_EMAIL") ??
      "repro-platform_admin@example.test",
    password: env("ADMIN_CRUD_PLATFORM_ADMIN_PASSWORD") ?? "Repro-Passw0rd!",
    app: "admin",
    loginPath: "/admin/auth/login",
  },
  PLATFORM_OPERATIONS: {
    email:
      env("ADMIN_CRUD_PLATFORM_OPERATIONS_EMAIL") ??
      "repro-platform_operations@example.test",
    password:
      env("ADMIN_CRUD_PLATFORM_OPERATIONS_PASSWORD") ?? "Repro-Passw0rd!",
    app: "admin",
    loginPath: "/admin/auth/login",
  },
  TENANT_ADMIN: {
    email:
      env("ADMIN_CRUD_TENANT_ADMIN_EMAIL") ?? "system-admin@dijipeople.local",
    password:
      env("ADMIN_CRUD_TENANT_ADMIN_PASSWORD") ??
      env("DEMO_USER_PASSWORD") ??
      "DemoUser@12345",
    app: "web",
    loginPath: "/auth/login",
    // The tenant login DTO requires tenant context (slug/code/domain/host) —
    // an admin console login needs none of this, so it is only added here.
    tenantSlug: env("ADMIN_CRUD_TENANT_SLUG") ?? "dijipeople-demo",
  },
};

/*
 * Every platform-runtime *CRUD* module, from the generated schema's own key
 * list.
 *
 * `dashboard` is deliberately excluded even though the client-side registry
 * (`platform-module-registry.ts`) declares it as a module with
 * `apiBase: "/platform-runtime/dashboard"` (per
 * `docs/tasks/TASK-0032-streams/discovery/D6-admin-crud-inventory.md`) — that
 * `apiBase` string is, as D6 itself documents, descriptive metadata the HTTP
 * adapter never reads. Confirmed directly against the service: `'dashboard'`
 * appears nowhere in `platform-runtime.service.ts` or
 * `platform-runtime.types.ts`; the real dashboard data comes from its own
 * `services/api/src/modules/dashboard/dashboard.controller.ts`
 * (`GET /dashboard/summary`, `GET /dashboard/views/:viewKey`), not the
 * generic runtime dispatcher. Running CRUD checks against
 * `/platform-runtime/dashboard` only produces a 404 that has nothing to do
 * with dashboard's actual behaviour — this is a small discovery-doc
 * correction, not a product defect.
 */
const SCHEMA_PATH = path.join(
  REPO_ROOT,
  "packages/config/platform-runtime-schema.generated.json",
);
const SCHEMA = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
const MODULE_KEYS = Object.keys(SCHEMA.modules);

/*
 * Capability facts confirmed by reading
 * `services/api/src/modules/platform-runtime/platform-runtime.service.ts`'s
 * create()/update()/deleteRecords() switch statements directly (the generated
 * schema only says which *fields* are creatable/editable, not which whole
 * *module* the service's switch actually handles) — cross-checked against
 * `docs/tasks/TASK-0032-streams/discovery/D6-admin-crud-inventory.md`.
 */
const CREATE_CAPABLE = new Set([
  "leads",
  "partners",
  "customers",
  "customer-onboarding",
  "contracts",
  "support-cases",
]);
const UPDATE_CAPABLE = new Set([
  "leads",
  "partners",
  "customers",
  "customer-onboarding",
  "tenants",
  "contracts",
  "plans",
]);
const DELETE_CAPABLE = new Set([
  "leads",
  "partners",
  "customers",
  "customer-onboarding",
  "partner-inquiries",
  "partner-onboarding",
]);
// `remove()` dispatches every module through the same private method, whose
// default case 400s rather than 500s — safe to call on any real id.
const NO_VIEW_BY_ID = new Set(["dashboard"]);
const NO_LIST = new Set([]);

const results = []; // { moduleKey, checks: {checkName: {status, detail}} }
const findings = [];
const createdRecords = []; // { moduleKey, id } — for the cleanup pass
const cleanupFailures = [];

function recordFinding(severity, summary, detail) {
  findings.push({ severity, summary, detail });
}

function moduleResult(moduleKey) {
  let existing = results.find((entry) => entry.moduleKey === moduleKey);
  if (!existing) {
    existing = { moduleKey, checks: {} };
    results.push(existing);
  }
  return existing;
}

function setCheck(moduleKey, name, status, detail) {
  moduleResult(moduleKey).checks[name] = { status, detail };
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

async function rawFetch(pathOrUrl, init = {}) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function login(roleName) {
  const creds = ROLE_CREDENTIALS[roleName];
  if (!creds?.email || !creds?.password) {
    return { roleName, token: null, error: "No credentials configured." };
  }
  const response = await rawFetch(creds.loginPath, {
    method: "POST",
    headers: { "X-DijiPeople-App": creds.app },
    body: JSON.stringify({
      email: creds.email,
      password: creds.password,
      ...(creds.tenantSlug ? { tenantSlug: creds.tenantSlug } : {}),
    }),
  });
  const token =
    response.body?.tokens?.accessToken ?? response.body?.accessToken ?? null;
  if (!token) {
    return {
      roleName,
      token: null,
      error: `Login failed (${response.status}): ${JSON.stringify(response.body).slice(0, 200)}`,
    };
  }
  return { roleName, token, app: creds.app };
}

function authedFetch(session) {
  return (pathOrUrl, init = {}) =>
    rawFetch(pathOrUrl, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.token}`,
        "X-DijiPeople-App": session.app,
        ...(init.headers ?? {}),
      },
    });
}

// ---------------------------------------------------------------------------
// Fixtures for the six create-capable modules
// ---------------------------------------------------------------------------

const RUN_TAG = `zzzharness${Date.now().toString(36)}`;

function leadFixture(suffix = "") {
  return {
    contactFirstName: "Harness",
    contactLastName: `Lead${suffix}`,
    companyName: `${RUN_TAG} Lead Co ${suffix}`.trim(),
    workEmail: `${RUN_TAG}${suffix}@example.test`,
    industry: "Technology",
    companySize: "11-50",
  };
}

function partnerFixture(suffix = "") {
  return {
    type: "COMPANY",
    displayName: `${RUN_TAG} Partner ${suffix}`.trim(),
    email: `${RUN_TAG}partner${suffix}@example.test`,
    defaultCommissionRate: 10,
  };
}

function customerFixture(suffix = "") {
  return {
    companyName: `${RUN_TAG} Customer ${suffix}`.trim(),
    primaryContactFirstName: "Harness",
    primaryContactLastName: `Customer${suffix}`,
    primaryContactEmail: `${RUN_TAG}customer${suffix}@example.test`,
    // Required (`country!: string`, not `@IsOptional()`) on
    // `CreateCustomerDto` in
    // `services/api/src/modules/super-admin/dto/customer-lifecycle.dto.ts` —
    // omitting it 400s with a message naming a field this fixture never sent.
    country: "United Arab Emirates",
  };
}

function onboardingFixture(customerId, suffix = "") {
  return {
    customerId,
    plannedTenantSlug: `${RUN_TAG}-onb${suffix}`.toLowerCase(),
  };
}

function contractFixture(suffix = "") {
  return {
    title: `${RUN_TAG} Contract ${suffix}`.trim(),
    // Not CUSTOMER_AGREEMENT/PARTNER_AGREEMENT/MASTER_PARTNER_AGREEMENT — each
    // of those has its own extra business-rule requirement
    // (`ContractsService.validateCounterparty()`: a customer agreement needs
    // `customerAccountId`/`relatedLeadId`, a partner agreement needs
    // `partnerId`) that a truly minimal fixture should not have to satisfy.
    contractType: "MASTER_SERVICES_AGREEMENT",
    counterpartyName: `${RUN_TAG} Counterparty ${suffix}`.trim(),
  };
}

function supportCaseFixture(suffix = "") {
  return {
    title: `${RUN_TAG} Support case ${suffix}`.trim(),
    description: "Created by the WP-08 admin CRUD matrix harness.",
  };
}

const FIXTURES = {
  leads: leadFixture,
  partners: partnerFixture,
  customers: customerFixture,
  contracts: contractFixture,
  "support-cases": supportCaseFixture,
  // customer-onboarding needs a customerId and is wired up specially below.
};

// ---------------------------------------------------------------------------
// Per-module checks
// ---------------------------------------------------------------------------

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

async function checkList(fetcher, moduleKey) {
  const response = await fetcher(`/platform-runtime/${moduleKey}`);
  if (response.status !== 200) {
    setCheck(moduleKey, "list", "FAIL", `GET list -> ${response.status}`);
    if (response.status >= 500)
      recordFinding(
        "HIGH",
        `${moduleKey}: list returned ${response.status}`,
        JSON.stringify(response.body).slice(0, 300),
      );
    return null;
  }
  const items =
    response.body?.items ?? response.body?.data?.items ?? response.body ?? [];
  setCheck(moduleKey, "list", "PASS", `${Array.isArray(items) ? items.length : "?"} item(s)`);

  // Pagination
  const paged = await fetcher(`/platform-runtime/${moduleKey}?page=1&pageSize=1`);
  setCheck(
    moduleKey,
    "pagination",
    paged.status === 200 ? "PASS" : "FAIL",
    `page=1&pageSize=1 -> ${paged.status}`,
  );

  // Search (a search term that should not match anything real)
  const searched = await fetcher(
    `/platform-runtime/${moduleKey}?search=${encodeURIComponent(RUN_TAG + "-no-match")}`,
  );
  setCheck(
    moduleKey,
    "search",
    searched.status === 200 ? "PASS" : "FAIL",
    `search=<nonmatching> -> ${searched.status}`,
  );
  if (searched.status >= 500)
    recordFinding(
      "HIGH",
      `${moduleKey}: search param caused ${searched.status}`,
      JSON.stringify(searched.body).slice(0, 300),
    );

  return Array.isArray(items) ? items : [];
}

async function checkView(fetcher, moduleKey, sampleId) {
  if (NO_VIEW_BY_ID.has(moduleKey)) {
    setCheck(moduleKey, "view", "N/A", "module has no view-by-id route");
    return;
  }
  if (!sampleId) {
    setCheck(moduleKey, "view", "N/A", "no existing record to view");
    return;
  }
  const response = await fetcher(
    `/platform-runtime/${moduleKey}/${encodeURIComponent(sampleId)}`,
  );
  setCheck(
    moduleKey,
    "view",
    response.status === 200 ? "PASS" : "FAIL",
    `GET :id -> ${response.status}`,
  );
  if (response.status >= 500)
    recordFinding(
      "HIGH",
      `${moduleKey}: view returned 500 for a real id`,
      JSON.stringify(response.body).slice(0, 300),
    );
}

async function checkMalformedAndMissingId(fetcher, moduleKey) {
  if (NO_VIEW_BY_ID.has(moduleKey)) {
    setCheck(moduleKey, "malformedId", "N/A", "no id route");
    setCheck(moduleKey, "missingId", "N/A", "no id route");
    return;
  }
  const malformed = await fetcher(
    `/platform-runtime/${moduleKey}/not-a-real-id`,
  );
  const malformedOk = malformed.status === 400 || malformed.status === 404;
  setCheck(
    moduleKey,
    "malformedId",
    malformedOk ? "PASS" : malformed.status >= 500 ? "FAIL(500)" : "FAIL",
    `GET :id=not-a-real-id -> ${malformed.status}`,
  );
  if (!malformedOk)
    recordFinding(
      malformed.status >= 500 ? "HIGH" : "MEDIUM",
      `${moduleKey}: malformed id returned ${malformed.status}, expected 400/404`,
      JSON.stringify(malformed.body).slice(0, 300),
    );

  const missing = await fetcher(`/platform-runtime/${moduleKey}/${NIL_UUID}`);
  const missingOk = missing.status === 404;
  setCheck(
    moduleKey,
    "missingId",
    missingOk ? "PASS" : missing.status >= 500 ? "FAIL(500)" : "FAIL",
    `GET :id=<nil-uuid> -> ${missing.status}`,
  );
  if (!missingOk)
    recordFinding(
      missing.status >= 500 ? "HIGH" : "MEDIUM",
      `${moduleKey}: missing id returned ${missing.status}, expected 404`,
      JSON.stringify(missing.body).slice(0, 300),
    );
}

/*
 * GET /audit-logs as SUPER_ADMIN, looking for a row this run's mutation
 * should have produced.
 *
 * `AuditLogQueryDto` (`services/api/src/modules/audit/dto/audit-log-query.dto.ts`)
 * has no `entityId`/`filters` param at all — only `action`/`entityType`/
 * `actorUserId`/`fromDate`/`toDate`/`page`/`pageSize` — so this reads the
 * most recent page and looks for a match client-side rather than sending an
 * unknown query field (`forbidNonWhitelisted` would 400 it).
 *
 * More fundamentally: `AuditController.listAuditLogs()` calls
 * `AuditService.listByTenant(user.tenantId, ...)`, and every platform-runtime
 * mutation calls `AuditService.log({ tenantId: 'platform', ... })`, which
 * `AuditService.log()` routes to `AuditRepository.createPlatform()` — a
 * *different* table (`PlatformAuditLog`, no `tenantId` column at all), not
 * the `AuditLog` table `findByTenant()` reads. A platform user's `tenantId`
 * is also the literal string `'platform'`
 * (`auth-access.service.ts:loadPlatformAccessContext`), so even if this call
 * is authorized, `findByTenant('platform', ...)` queries the *tenant* table
 * for `tenantId = 'platform'` — a row nothing ever writes. This check exists
 * to make that gap concrete per-module rather than asserting it once.
 */
async function checkAudit(fetcher, moduleKey, entityId) {
  const response = await fetcher(`/audit-logs?pageSize=50`);
  if (response.status === 403 || response.status === 401) {
    setCheck(
      moduleKey,
      "audit",
      "UNVERIFIABLE",
      `GET /audit-logs -> ${response.status} for a platform user`,
    );
    return;
  }
  if (response.status !== 200) {
    setCheck(moduleKey, "audit", "FAIL", `GET /audit-logs -> ${response.status}`);
    return;
  }
  const items = response.body?.items ?? [];
  const found = Array.isArray(items) && items.some((item) => item.entityId === entityId);
  setCheck(
    moduleKey,
    "audit",
    found ? "PASS" : "UNVERIFIABLE",
    found
      ? "found a matching row"
      : `0 of ${Array.isArray(items) ? items.length : "?"} rows matched entityId — PlatformAuditLog is write-only, see finding`,
  );
}

async function checkCreateRefused(fetcher, moduleKey) {
  const response = await fetcher(`/platform-runtime/${moduleKey}`, {
    method: "POST",
    body: JSON.stringify({ values: {} }),
  });
  const ok = response.status === 400;
  setCheck(
    moduleKey,
    "create",
    ok ? "PASS(refused)" : response.status >= 500 ? "FAIL(500)" : "FAIL",
    `POST {} -> ${response.status}`,
  );
  if (response.status >= 500)
    recordFinding(
      "HIGH",
      `${moduleKey}: create returned 500 instead of a refusal`,
      JSON.stringify(response.body).slice(0, 300),
    );
}

async function checkUpdateRefused(fetcher, moduleKey, sampleId) {
  if (!sampleId) {
    setCheck(moduleKey, "edit", "N/A", "no existing record to attempt an edit on");
    return;
  }
  const response = await fetcher(
    `/platform-runtime/${moduleKey}/${encodeURIComponent(sampleId)}`,
    { method: "PATCH", body: JSON.stringify({ values: {} }) },
  );
  const ok = response.status === 400 || response.status === 403;
  setCheck(
    moduleKey,
    "edit",
    ok ? "PASS(refused)" : response.status >= 500 ? "FAIL(500)" : "FAIL",
    `PATCH {} -> ${response.status}`,
  );
  if (response.status >= 500)
    recordFinding(
      "HIGH",
      `${moduleKey}: update returned 500 instead of a refusal`,
      JSON.stringify(response.body).slice(0, 300),
    );
}

async function checkDeleteRefusedOrSafe(fetcher, moduleKey, sampleId) {
  if (!sampleId) {
    setCheck(moduleKey, "delete", "N/A", "no existing record to attempt a delete on");
    return;
  }
  const response = await fetcher(
    `/platform-runtime/${moduleKey}/${encodeURIComponent(sampleId)}`,
    { method: "DELETE" },
  );
  // These modules never delete for real (confirmed by reading the service's
  // deleteRecords() switch) — any non-500 outcome is the refusal working.
  const ok = response.status !== 500;
  setCheck(
    moduleKey,
    "delete",
    ok ? "PASS(refused)" : "FAIL(500)",
    `DELETE :id -> ${response.status}${
      typeof response.body?.message === "string"
        ? ` "${response.body.message}"`
        : ""
    }`,
  );
  if (!ok)
    recordFinding(
      "HIGH",
      `${moduleKey}: delete of a real record returned 500 instead of a refusal`,
      JSON.stringify(response.body).slice(0, 300),
    );
}

// ---------------------------------------------------------------------------
// Authorization matrix
// ---------------------------------------------------------------------------

async function checkAuthorization(sessions, moduleKey, sampleId) {
  const outcomes = [];
  for (const roleName of [
    "PLATFORM_ADMIN",
    "PLATFORM_OPERATIONS",
    "TENANT_ADMIN",
  ]) {
    const session = sessions[roleName];
    if (!session?.token) {
      outcomes.push(`${roleName}=NO_CREDS`);
      continue;
    }
    const fetcher = authedFetch(session);
    const response = await fetcher(`/platform-runtime/${moduleKey}`);
    outcomes.push(`${roleName}(list)=${response.status}`);
    if (roleName === "TENANT_ADMIN" && response.status !== 401 && response.status !== 403) {
      recordFinding(
        "CRITICAL",
        `${moduleKey}: a tenant user reached a platform-runtime endpoint`,
        `TENANT_ADMIN list -> ${response.status}, expected 401/403`,
      );
    }
    if (sampleId && !NO_VIEW_BY_ID.has(moduleKey)) {
      const editResponse = await fetcher(
        `/platform-runtime/${moduleKey}/${encodeURIComponent(sampleId)}`,
        { method: "PATCH", body: JSON.stringify({ values: {} }) },
      );
      outcomes.push(`${roleName}(edit)=${editResponse.status}`);
      if (
        roleName === "TENANT_ADMIN" &&
        editResponse.status !== 401 &&
        editResponse.status !== 403
      ) {
        recordFinding(
          "CRITICAL",
          `${moduleKey}: a tenant user reached a platform-runtime write endpoint`,
          `TENANT_ADMIN edit -> ${editResponse.status}, expected 401/403`,
        );
      }
    }
  }
  // Anonymous
  const anon = await rawFetch(`/platform-runtime/${moduleKey}`);
  outcomes.push(`ANON(list)=${anon.status}`);
  if (anon.status !== 401) {
    recordFinding(
      "CRITICAL",
      `${moduleKey}: an unauthenticated caller did not get 401`,
      `ANON list -> ${anon.status}`,
    );
  }
  setCheck(moduleKey, "authorization", "INFO", outcomes.join(", "));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`# Admin CRUD matrix — ${new Date().toISOString()}`);
  console.log(`API base: ${API_BASE}\n`);

  const sessions = {};
  for (const roleName of Object.keys(ROLE_CREDENTIALS)) {
    sessions[roleName] = await login(roleName);
    if (!sessions[roleName].token) {
      console.error(`WARN: could not log in as ${roleName}: ${sessions[roleName].error}`);
    }
  }
  if (!sessions.SUPER_ADMIN?.token) {
    console.error("FATAL: could not authenticate as SUPER_ADMIN. Aborting.");
    process.exitCode = 1;
    return;
  }
  const admin = authedFetch(sessions.SUPER_ADMIN);

  recordFinding(
    "HIGH",
    "PlatformAuditLog is write-only — no endpoint anywhere in services/api reads it back",
    "`grep -rn platformAuditLog services/api/src --include=*.ts` finds only `.create()` call " +
      "sites (audit.repository.ts, demo-data/demo-data.operations.ts, " +
      "platform-users/platform-users.service.ts x5, app-releases/release-publisher.service.ts) — " +
      "zero `.findMany`/`.findFirst`/`.findUnique`/`.count`. Every platform-runtime mutation " +
      "(leads/partners/customers/customer-onboarding/contracts/support-cases/tenants/plans) that " +
      "calls AuditService.log() with tenantId:'platform' writes here. The one exposed read route, " +
      "GET /audit-logs (AuditController -> AuditService.listByTenant(user.tenantId, ...)), queries " +
      "the *different* AuditLog table by tenantId — and a platform user's tenantId is the literal " +
      "string 'platform' (auth-access.service.ts loadPlatformAccessContext), so even an " +
      "authorized SUPER_ADMIN calling it gets a 200 with an empty page, not the platform trail. " +
      "Net effect: none of this WP's 'Audit' matrix cells can be positively verified through any " +
      "API — the per-module checks below corroborate this live. Not fixed here: platform-runtime, " +
      "audit and super-admin are outside apps/admin/WP-08's ownership.",
  );

  // ---- generic checks for every module ----
  const sampleIds = {};
  for (const moduleKey of MODULE_KEYS) {
    if (!NO_LIST.has(moduleKey)) {
      const items = await checkList(admin, moduleKey);
      if (items?.length) sampleIds[moduleKey] = items[0].id ?? items[0].item?.id;
    } else {
      setCheck(moduleKey, "list", "N/A", "no list route");
    }
    await checkView(admin, moduleKey, sampleIds[moduleKey]);
    await checkMalformedAndMissingId(admin, moduleKey);
  }

  // ---- create/edit/delete happy path for the six create-capable modules ----
  let createdCustomerId = null;
  for (const moduleKey of MODULE_KEYS) {
    if (!CREATE_CAPABLE.has(moduleKey)) {
      await checkCreateRefused(admin, moduleKey);
      continue;
    }
    await runCreateCapableModule(admin, moduleKey, () => createdCustomerId, (id) => {
      createdCustomerId = id;
    });
  }

  // ---- update/delete refusal for every module the runtime does not allow it on ----
  for (const moduleKey of MODULE_KEYS) {
    if (!UPDATE_CAPABLE.has(moduleKey) || !CREATE_CAPABLE.has(moduleKey)) {
      // For non-create-capable modules, probe with a real existing id if we have one.
      if (!UPDATE_CAPABLE.has(moduleKey)) {
        await checkUpdateRefused(admin, moduleKey, sampleIds[moduleKey]);
      }
    }
    if (!DELETE_CAPABLE.has(moduleKey)) {
      await checkDeleteRefusedOrSafe(admin, moduleKey, sampleIds[moduleKey]);
    }
  }

  // ---- authorization sweep (list + edit) for every module ----
  for (const moduleKey of MODULE_KEYS) {
    await checkAuthorization(sessions, moduleKey, sampleIds[moduleKey]);
  }

  // ---- duplicate-create 409 probe: customer-onboarding (BUG-2463 context) ----
  await checkDuplicateOnboarding(admin, createdCustomerId);

  // ---- tenant control plane: read-only only, per instructions ----
  await checkTenantControlPlaneReadOnly(admin);

  // ---- cleanup ----
  await cleanup(admin);

  render();
}

async function runCreateCapableModule(fetcher, moduleKey, getCustomerId, setCustomerId) {
  const fixture = FIXTURES[moduleKey];
  let payload;
  if (moduleKey === "customer-onboarding") {
    const customerId = getCustomerId();
    if (!customerId) {
      setCheck(
        moduleKey,
        "create",
        "SKIPPED",
        "no customer id available yet (customers module must run first)",
      );
      setCheck(moduleKey, "edit", "SKIPPED", "depends on create");
      setCheck(moduleKey, "delete", "SKIPPED", "depends on create");
      return;
    }
    payload = onboardingFixture(customerId, "a");
  } else {
    payload = fixture("a");
  }

  // valid create
  const created = await fetcher(`/platform-runtime/${moduleKey}`, {
    method: "POST",
    body: JSON.stringify({ values: payload }),
  });
  const createOk = created.status === 200 || created.status === 201;
  const createdId = created.body?.item?.id ?? created.body?.data?.item?.id;
  setCheck(
    moduleKey,
    "create",
    createOk ? "PASS" : "FAIL",
    `POST <valid> -> ${created.status}${createdId ? ` id=${createdId}` : ""}`,
  );
  if (!createOk) {
    recordFinding(
      created.status >= 500 ? "HIGH" : "MEDIUM",
      `${moduleKey}: valid create payload was rejected`,
      `${created.status}: ${JSON.stringify(created.body).slice(0, 300)}`,
    );
  } else {
    createdRecords.push({ moduleKey, id: createdId });
    if (moduleKey === "customers") setCustomerId(createdId);
  }

  // invalid create (missing every required field)
  const invalid = await fetcher(`/platform-runtime/${moduleKey}`, {
    method: "POST",
    body: JSON.stringify({ values: {} }),
  });
  const invalidOk =
    invalid.status === 400 &&
    (Array.isArray(invalid.body?.fieldErrors) || Array.isArray(invalid.body?.errors) || invalid.body?.message);
  setCheck(
    moduleKey,
    "validation",
    invalidOk ? "PASS" : invalid.status >= 500 ? "FAIL(500)" : "FAIL",
    `POST {} -> ${invalid.status}`,
  );
  if (invalid.status >= 500)
    recordFinding(
      "HIGH",
      `${moduleKey}: invalid create payload returned 500 instead of 400`,
      JSON.stringify(invalid.body).slice(0, 300),
    );

  if (!createOk || !createdId) return;

  // valid edit
  const editPayload = { values: editFixtureFor(moduleKey) };
  const edited = await fetcher(
    `/platform-runtime/${moduleKey}/${encodeURIComponent(createdId)}`,
    { method: "PATCH", body: JSON.stringify(editPayload) },
  );
  setCheck(
    moduleKey,
    "edit",
    edited.status === 200 ? "PASS" : "FAIL",
    `PATCH <valid> -> ${edited.status}`,
  );
  if (edited.status !== 200) {
    recordFinding(
      edited.status >= 500 ? "HIGH" : "MEDIUM",
      `${moduleKey}: a partial edit (only the changed field) was rejected`,
      `PATCH with just ${JSON.stringify(editFixtureFor(moduleKey))} -> ${edited.status}: ` +
        `${JSON.stringify(edited.body).slice(0, 300)}. ` +
        (moduleKey === "partners"
          ? "Root cause: UpdatePartnerDto extends CreatePartnerDto {} (partner.dto.ts) " +
            "instead of redeclaring every field @IsOptional() the way " +
            "UpdateAdminLeadDto/UpdateCustomerDto/UpdateContractDto/UpdateSupportCaseDto all do — " +
            "partners is the one create-capable module whose PATCH is not actually partial. " +
            "Not exercised by the real admin UI (buildWritePayload always resends every " +
            "editable field's current value, never a bare diff), but a true partial PATCH — " +
            "which the HTTP verb implies — 400s today."
          : ""),
    );
  }

  // invalid edit (bad enum / wrong type on a real field)
  const badEdit = await fetcher(
    `/platform-runtime/${moduleKey}/${encodeURIComponent(createdId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ values: invalidEditFor(moduleKey) }),
    },
  );
  const badEditOk = badEdit.status === 400;
  setCheck(
    moduleKey,
    "editValidation",
    badEditOk ? "PASS" : badEdit.status >= 500 ? "FAIL(500)" : "FAIL",
    `PATCH <invalid> -> ${badEdit.status}`,
  );
  if (badEdit.status >= 500)
    recordFinding(
      "HIGH",
      `${moduleKey}: invalid edit payload returned 500 instead of 400`,
      JSON.stringify(badEdit.body).slice(0, 300),
    );

  // stale version — the generic runtime PATCH accepts a `version` field, but
  // no update() call site in platform-runtime.service.ts ever reads
  // `body.version` back out, so no module actually enforces optimistic
  // concurrency here. Recorded as a finding once, not per module.
  const staleVersion = await fetcher(
    `/platform-runtime/${moduleKey}/${encodeURIComponent(createdId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ values: editFixtureFor(moduleKey), version: 999999 }),
    },
  );
  setCheck(
    moduleKey,
    "concurrency",
    staleVersion.status === 200 ? "NOT_ENFORCED" : `status=${staleVersion.status}`,
    `PATCH with version=999999 -> ${staleVersion.status} (expected 409 if enforced)`,
  );

  await checkAudit(fetcher, moduleKey, createdId);

  // delete / cleanup
  if (DELETE_CAPABLE.has(moduleKey)) {
    // Deleted in the cleanup pass at the end, once every dependent record
    // (e.g. customer-onboarding under a customer) has had its own chance to
    // be exercised, so a customer isn't removed out from under its onboarding
    // record mid-run.
    setCheck(moduleKey, "delete", "PASS(deferred to cleanup)", "");
  } else {
    // Confirmed refused by the service's deleteRecords() switch; safe to call.
    await checkDeleteRefusedOrSafe(fetcher, moduleKey, createdId);
    cleanupFailures.push({
      moduleKey,
      id: createdId,
      reason:
        "module refuses delete by design (see D6 CRUD inventory) — record left in the throwaway database",
    });
  }
}

function editFixtureFor(moduleKey) {
  switch (moduleKey) {
    case "leads":
      return { companySize: "51-200" };
    case "partners":
      return { defaultCommissionRate: 15 };
    case "customers":
      return { industry: "Software" };
    case "customer-onboarding":
      return { subStatus: "harness-touch" };
    case "contracts":
      return { paymentTerms: "Net 30" };
    case "support-cases":
      return { category: "harness" };
    default:
      return {};
  }
}

function invalidEditFor(moduleKey) {
  switch (moduleKey) {
    case "leads":
      return { workEmail: "not-an-email" };
    case "partners":
      return { defaultCommissionRate: 999 }; // > Max(100)
    case "customers":
      return { primaryContactEmail: "not-an-email" };
    case "customer-onboarding":
      return { plannedTenantSlug: "Not A Valid Slug!" };
    case "contracts":
      return { contractType: "NOT_A_REAL_TYPE" };
    case "support-cases":
      return { status: "NOT_A_REAL_STATUS" };
    default:
      return { theseFieldsDoNotExist: true };
  }
}

async function checkDuplicateOnboarding(fetcher, customerId) {
  if (!customerId) {
    recordFinding(
      "INFO",
      "customer-onboarding: duplicate-create probe skipped",
      "no customer id was available (customers create likely failed earlier)",
    );
    return;
  }
  const first = await fetcher(`/platform-runtime/customer-onboarding`, {
    method: "POST",
    body: JSON.stringify({ values: onboardingFixture(customerId, "dup1") }),
  });
  if (first.status !== 200 && first.status !== 201) {
    recordFinding(
      "INFO",
      "customer-onboarding: duplicate-create probe skipped",
      `first onboarding create failed: ${first.status}`,
    );
    return;
  }
  createdRecords.push({
    moduleKey: "customer-onboarding",
    id: first.body?.item?.id,
    parentCustomerId: customerId,
  });
  const second = await fetcher(`/platform-runtime/customer-onboarding`, {
    method: "POST",
    body: JSON.stringify({ values: onboardingFixture(customerId, "dup2") }),
  });
  const ok = second.status === 409;
  setCheck(
    "customer-onboarding",
    "duplicateCreate",
    ok ? "PASS" : second.status >= 500 ? "FAIL(500)" : "FAIL",
    `2nd onboarding for same customer -> ${second.status}: ${
      typeof second.body?.message === "string" ? second.body.message : ""
    }`,
  );
  if (second.status === 200 || second.status === 201) {
    createdRecords.push({
      moduleKey: "customer-onboarding",
      id: second.body?.item?.id,
      parentCustomerId: customerId,
    });
  }
  if (second.status >= 500) {
    recordFinding(
      "HIGH",
      "customer-onboarding: duplicate create returned 500",
      JSON.stringify(second.body).slice(0, 300),
    );
  } else if (!ok) {
    recordFinding(
      "MEDIUM",
      "customer-onboarding: duplicate create did not 409",
      `Expected 409 ('Customer already has an active onboarding record.'); got ${second.status}. ` +
        `Re-check BUG-2463's premise for this endpoint against this evidence.`,
    );
  } else {
    recordFinding(
      "INFO",
      "customer-onboarding: duplicate create correctly returns 409 with a domain message",
      `This is the same endpoint BUG-2463 (DEFERRED) names as returning a generic ` +
        `"Database constraint failed" — live evidence at commit 10d5d148 shows a clear ` +
        `ConflictException instead. Worth re-checking BUG-2463's premise for this endpoint ` +
        `specifically (its other three endpoints were not exercised by this harness).`,
    );
  }
}

async function checkTenantControlPlaneReadOnly(fetcher) {
  const list = await fetcher(`/platform-runtime/tenants?pageSize=5`);
  if (list.status !== 200) {
    recordFinding(
      "HIGH",
      "tenants: list failed for SUPER_ADMIN",
      `${list.status}`,
    );
    return;
  }
  const items = list.body?.items ?? [];
  const tenant = items[0];
  setCheck("tenants", "controlPlaneReadOnly", tenant ? "PASS" : "N/A", tenant ? `read ${items.length} tenant(s)` : "no tenants in this database");
  if (!tenant) return;
  const overview = await fetcher(
    `/platform/tenants/${encodeURIComponent(tenant.id)}/overview`,
  );
  setCheck(
    "tenants",
    "controlPlaneOverview",
    overview.status === 200 ? "PASS" : "FAIL",
    `GET .../overview -> ${overview.status}`,
  );
  // Deliberately no suspend/reactivate/erase call here: tenant creation is
  // not possible through the runtime (create: false), so per this WP's
  // instructions only read-only checks are performed against real tenants —
  // the seeded demo tenant is never mutated by this harness.
}

async function cleanup(fetcher) {
  // Delete children before parents: customer-onboarding rows cascade away
  // when their CustomerAccount is deleted, but delete them explicitly first
  // where the API allows it so the harness doesn't rely on that cascade.
  const order = ["customer-onboarding", "leads", "partners", "customers"];
  const byModule = new Map();
  for (const record of createdRecords) {
    if (!record.id) continue;
    if (!byModule.has(record.moduleKey)) byModule.set(record.moduleKey, []);
    byModule.get(record.moduleKey).push(record);
  }
  for (const moduleKey of order) {
    const records = byModule.get(moduleKey) ?? [];
    for (const record of records) {
      if (!DELETE_CAPABLE.has(moduleKey)) continue; // handled as a reported leftover already
      const response = await fetcher(
        `/platform-runtime/${moduleKey}/${encodeURIComponent(record.id)}`,
        { method: "DELETE" },
      );
      if (response.status !== 200 && response.status !== 204) {
        cleanupFailures.push({
          moduleKey,
          id: record.id,
          reason: `DELETE returned ${response.status}: ${JSON.stringify(response.body).slice(0, 200)}`,
        });
      }
    }
    byModule.delete(moduleKey);
  }
  // Anything left over (modules not in `order`, e.g. contracts/support-cases)
  // was already queued into cleanupFailures by runCreateCapableModule.
  for (const [moduleKey, records] of byModule) {
    for (const record of records) {
      if (!cleanupFailures.some((f) => f.moduleKey === moduleKey && f.id === record.id)) {
        cleanupFailures.push({
          moduleKey,
          id: record.id,
          reason: "left over — not covered by the cleanup pass",
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function cell(moduleResultEntry, key) {
  const check = moduleResultEntry.checks[key];
  if (!check) return "-";
  return check.status;
}

function render() {
  const lines = [];
  lines.push(`# Admin CRUD matrix`);
  lines.push("");
  lines.push(`Run at ${new Date().toISOString()} against \`${API_BASE}\`.`);
  lines.push("");
  lines.push(
    "| Module | List | View | Create | Edit | Delete | Search | Filter | Pagination | Validation | Authorization | Audit |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const moduleKey of MODULE_KEYS) {
    const entry = moduleResult(moduleKey);
    lines.push(
      `| ${moduleKey} | ${cell(entry, "list")} | ${cell(entry, "view")} | ${cell(entry, "create")} | ${cell(entry, "edit")} | ${cell(entry, "delete")} | ${cell(entry, "search")} | ${cell(entry, "malformedId")}/${cell(entry, "missingId")} | ${cell(entry, "pagination")} | ${cell(entry, "validation")}/${cell(entry, "editValidation")} | see below | ${cell(entry, "audit")} |`,
    );
  }
  lines.push("");
  lines.push("## Per-module detail");
  lines.push("");
  for (const moduleKey of MODULE_KEYS) {
    const entry = moduleResult(moduleKey);
    lines.push(`### ${moduleKey}`);
    for (const [name, check] of Object.entries(entry.checks)) {
      lines.push(`- **${name}**: ${check.status} — ${check.detail}`);
    }
    lines.push("");
  }
  lines.push("## Findings");
  lines.push("");
  if (!findings.length) lines.push("None.");
  for (const finding of findings) {
    lines.push(`- **[${finding.severity}]** ${finding.summary}`);
    lines.push(`  - ${finding.detail}`);
  }
  lines.push("");
  lines.push("## Cleanup");
  lines.push("");
  lines.push(`Created ${createdRecords.length} record(s) this run.`);
  if (!cleanupFailures.length) {
    lines.push("All deletable records were cleaned up.");
  } else {
    lines.push(`${cleanupFailures.length} record(s) could not be removed:`);
    for (const failure of cleanupFailures) {
      lines.push(`- ${failure.moduleKey} / ${failure.id}: ${failure.reason}`);
    }
  }

  const output = lines.join("\n");
  console.log(output);
  const outFile = env("ADMIN_CRUD_OUT_FILE");
  if (outFile) {
    fs.writeFileSync(outFile, output, "utf8");
    console.error(`\nWrote matrix to ${outFile}`);
  }
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exitCode = 1;
});
