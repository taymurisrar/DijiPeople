import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { BASE_URLS } from "../playwright.config";
import {
  probeTenantProduct,
  RUN_ID,
  withDatabase,
} from "../fixtures/environment";
import {
  openWeb,
  resolveTenant,
  signInToWeb,
  tenantCredentials,
  type TenantTarget,
} from "../fixtures/web-session";

/**
 * Flow L — module acceptance in a real browser: what a customer does with a
 * module from creation to package round trip, checked in the UI, through the API
 * and in the database.
 *
 *  L1  create three modules through the UI (Standard, Immutable, Configuration)
 *  L2  defaults: fields, system views, forms, command bar — per kind
 *  L3  create / edit / deactivate / activate / delete in the UI (Standard)
 *  L4  Quick Create form, and the forms a module carries (Main, Quick Create,
 *      Quick View, Lookup)
 *  L5  Immutable and Configuration: prohibited actions are absent in the UI and
 *      refused by the API
 *  L6  lookup relationship between two custom modules; refusal paths
 *  L7  package: create, release, export; strip defaults and re-import; re-import
 *      again (idempotent, customizations kept, no duplicates)
 *  L8  mobile viewport
 *
 * Everything it creates is keyed by this run and removed in afterAll.
 */

const SUFFIX = RUN_ID.replace(/[^a-zA-Z0-9]/g, "").slice(-10);
const DEAL = "LAcc Deal";
const LEDGER = "LAcc Ledger";
const CONFIG = "LAcc Setting";
const PKG_PREFIX = "klacc";
const PKG_KEY = `${PKG_PREFIX}_pkg${SUFFIX}`;
const PKG_TABLE = `klaccAsset${SUFFIX}`;
const PKG_DISPLAY = "LAcc Asset";

let tenant: TenantTarget | null = null;
let page: Page;
/** Keys the UI generated, re-keyed to this run so reruns never collide. */
const KEYS = {
  deal: `ldeal${SUFFIX}`,
  ledger: `lledger${SUFFIX}`,
  config: `lconfig${SUFFIX}`,
};
const ALL_TABLE_KEYS = [...Object.values(KEYS), PKG_TABLE];

test.describe.configure({ mode: "serial" });
// Every step navigates a dev server that compiles routes on first visit.
test.setTimeout(240_000);

type ApiResult<T = any> = { status: number; json: T; text: string };

async function api<T = any>(
  method: string,
  path: string,
  data?: unknown,
): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ method, path, data }) => {
      const res = await fetch(`/api${path}`, {
        method,
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* not JSON */
      }
      return { status: res.status, json, text };
    },
    { method, path, data },
  ) as Promise<ApiResult<T>>;
}

async function db<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const rows = await withDatabase(
    async (client) => (await client.query(sql, params)).rows,
  );
  return (rows ?? []) as T[];
}

const listUrl = (key: string, extra = "") =>
  `/custom-modules/${key}${extra ? `?${extra}` : ""}`;

async function settle() {
  await page.waitForLoadState("networkidle");
}

/** Names in the first data column of the visible list, after the table has rendered. */
async function rowNames() {
  await expect(page.locator("tbody tr").first()).toBeVisible({
    timeout: 30_000,
  });
  return (await page.locator("tbody tr td:nth-child(2)").allInnerTexts()).map(
    (t) => t.trim(),
  );
}

async function openMoreCommands() {
  await page.getByRole("button", { name: "More commands" }).click();
}

async function visibleCommands(): Promise<string[]> {
  const buttons = (await page.getByRole("button").allInnerTexts())
    .map((t) => t.trim())
    .filter(Boolean);
  return buttons;
}

async function createModuleThroughUi(
  display: string,
  plural: string,
  type: string | null,
) {
  await openWeb(page, BASE_URLS.web, tenant!, "/settings/customization/tables");
  await page.getByRole("button", { name: "Create module" }).first().click();
  const dialog = page.getByRole("dialog").first();
  await dialog.getByLabel("Display name").fill(display);
  await dialog.getByLabel("Plural name").fill(plural);
  if (type) {
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: type }).click();
  }
  await dialog.getByRole("button", { name: /^create$/i }).click();
  await page.waitForURL(/\/settings\/customization\/tables\/[^/?]+/, {
    timeout: 30_000,
  });
  await expect(page.getByText(display).first()).toBeVisible();
}

async function addFields(key: string, extra: Record<string, unknown>[] = []) {
  for (const column of [
    {
      columnKey: "dd_name",
      displayName: "Name",
      dataType: "text",
      isPrimaryName: true,
    },
    { columnKey: "dd_stage", displayName: "Stage", dataType: "text" },
    ...extra,
  ]) {
    const res = await api(
      "POST",
      `/customization/tables/${key}/columns`,
      column,
    );
    expect(res.status, res.text.slice(0, 300)).toBe(201);
  }
}

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) out[key] = canonical(child);
    }
    return out;
  }
  return value;
};
const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

/** Re-seals an artifact after components were removed, exactly as the exporter does. */
function reseal(artifact: any) {
  for (const component of artifact.components) {
    component.checksum = sha256(
      JSON.stringify(
        canonical({
          key: component.key,
          type: component.type,
          objectKey: component.objectKey,
          parentKey: component.parentKey,
          layerAction: component.layerAction,
          baseIsSystem: component.baseIsSystem,
          definition: component.definition,
          layer: component.layer,
          dependsOn: component.dependsOn,
        }),
      ),
    );
  }
  artifact.manifest.componentCount = artifact.components.length;
  artifact.contentChecksum = sha256(
    JSON.stringify(
      canonical({
        manifest: artifact.manifest,
        components: artifact.components.map((c: any) => c.checksum),
      }),
    ),
  );
  return JSON.stringify(canonical(artifact));
}

async function uploadPackage(content: string) {
  return page.evaluate(async (content) => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([content], { type: "application/json" }),
      "package.json",
    );
    const res = await fetch("/api/customization/package-imports/analyze", {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, json, text };
  }, content) as Promise<ApiResult>;
}

async function moduleCounts(key: string) {
  const [row] = await db(
    `select (select count(*) from "CustomizationView" v where v."tableId" = t.id)::int as views,
            (select count(*) from "CustomizationForm" f where f."tableId" = t.id)::int as forms,
            (select count(*) from "CustomizationColumn" c where c."tableId" = t.id)::int as columns,
            t."moduleKind" as kind
       from "CustomizationTable" t where t."tenantId" = $1 and t."tableKey" = $2`,
    [tenant!.tenantId, key],
  );
  return row;
}

test.beforeAll(async ({ browser }) => {
  const environment = await probeTenantProduct({
    web: BASE_URLS.web,
    api: BASE_URLS.api,
  });
  test.skip(
    !environment.ready,
    `environment not ready: ${environment.missing.join("; ")}`,
  );
  test.skip(
    !tenantCredentials(),
    "E2E_TENANT_USER_EMAIL / E2E_TENANT_USER_PASSWORD are unset (no default exists by design)",
  );
  tenant = await resolveTenant();
  test.skip(
    !tenant,
    "no ACTIVE tenant with a slug exists in the seeded database",
  );
  const context = await browser.newContext();
  page = await context.newPage();
  const landed = await signInToWeb(
    page,
    BASE_URLS.web,
    tenant!,
    tenantCredentials()!,
  );
  test.skip(landed === "picker", "set E2E_TENANT_SLUG to pin one workspace");
});

test.afterAll(async () => {
  if (!page) return;
  const failures: string[] = [];
  const run = async (label: string, sql: string, params: unknown[]) => {
    try {
      await db(sql, params);
    } catch (error) {
      failures.push(`${label}: ${(error as Error).message}`);
    }
  };
  const t = tenant!.tenantId;
  // Exactly what this flow created: its tables (by key), its package and publisher.
  await run(
    "records",
    `delete from "CustomDataRecord" where "tableId" in (select id from "CustomizationTable" where "tenantId" = $1 and "tableKey" = any($2))`,
    [t, ALL_TABLE_KEYS],
  );
  await run(
    "package components",
    `delete from "CustomizationSolutionComponent" where "tenantId" = $1 and "solutionId" in (select id from "CustomizationSolution" where "tenantId" = $1 and "solutionKey" = $2)`,
    [t, PKG_KEY],
  );
  await run(
    "tables",
    `delete from "CustomizationTable" where "tenantId" = $1 and "tableKey" = any($2)`,
    [t, ALL_TABLE_KEYS],
  );
  await run(
    "package operations",
    `delete from "CustomizationPackageOperation" where "tenantId" = $1 and "packageKey" = $2`,
    [t, PKG_KEY],
  );
  await run(
    "package versions",
    `delete from "CustomizationPackageVersion" where "tenantId" = $1 and "packageId" in (select id from "CustomizationSolution" where "tenantId" = $1 and "solutionKey" = $2)`,
    [t, PKG_KEY],
  );
  await run(
    "package",
    `delete from "CustomizationSolution" where "tenantId" = $1 and "solutionKey" = $2`,
    [t, PKG_KEY],
  );
  await run(
    "publisher",
    `delete from "CustomizationPublisher" where "tenantId" = $1 and "prefix" = $2`,
    [t, PKG_PREFIX],
  );
  await page.context().close();
  expect(failures, "cleanup left rows behind").toEqual([]);
});

test.describe("Flow L — module acceptance", () => {
  test("L1 — Standard, Immutable and Configuration modules are created through the UI", async () => {
    await createModuleThroughUi(DEAL, "LAcc Deals", null);
    await createModuleThroughUi(LEDGER, "LAcc Ledgers", "Immutable");
    await createModuleThroughUi(CONFIG, "LAcc Settings", "Configuration");
    const rows = await db(
      `select "tableKey", "displayName", "moduleKind" from "CustomizationTable" where "tenantId" = $1 and "displayName" = any($2)`,
      [tenant!.tenantId, [DEAL, LEDGER, CONFIG]],
    );
    const byName = Object.fromEntries(rows.map((r) => [r.displayName, r]));
    expect(byName[DEAL].moduleKind).toBe("STANDARD");
    expect(byName[LEDGER].moduleKind).toBe("IMMUTABLE");
    expect(byName[CONFIG].moduleKind).toBe("CONFIGURATION");
    for (const [name, key] of [
      [DEAL, KEYS.deal],
      [LEDGER, KEYS.ledger],
      [CONFIG, KEYS.config],
    ] as const) {
      await db(
        `update "CustomizationTable" set "tableKey" = $1 where "tenantId" = $2 and "tableKey" = $3`,
        [key, tenant!.tenantId, byName[name].tableKey],
      );
    }
    for (const key of Object.values(KEYS)) await addFields(key);
    const publish = await api("POST", "/customization/publish");
    expect(publish.status, publish.text.slice(0, 300)).toBe(201);
  });

  test("L2 — defaults per kind: system views, the four forms, and the command bar", async () => {
    const expectedViews: Record<string, string[]> = {
      [KEYS.deal]: [
        "activeRecords",
        "all",
        "inactiveRecords",
        "lookup",
        "myRecords",
        "quickFind",
        "recent",
      ],
      [KEYS.ledger]: ["all", "lookup", "quickFind", "recent"],
      [KEYS.config]: [
        "activeRecords",
        "all",
        "inactiveRecords",
        "lookup",
        "quickFind",
        "recent",
      ],
    };
    for (const [key, views] of Object.entries(expectedViews)) {
      const viewKeys = (
        await db(
          `select v."viewKey" from "CustomizationView" v join "CustomizationTable" t on t.id = v."tableId" where t."tenantId" = $1 and t."tableKey" = $2 order by 1`,
          [tenant!.tenantId, key],
        )
      ).map((r) => r.viewKey);
      // Customer-created modules may carry extra legacy views; the plan's own must all be there, and no others of the system set.
      for (const expected of views) expect(viewKeys).toContain(expected);
      const forbidden = [
        "activeRecords",
        "inactiveRecords",
        "myRecords",
      ].filter((v) => !views.includes(v));
      for (const view of forbidden) expect(viewKeys).not.toContain(view);
      const formKeys = (
        await db(
          `select f."formKey" from "CustomizationForm" f join "CustomizationTable" t on t.id = f."tableId" where t."tenantId" = $1 and t."tableKey" = $2`,
          [tenant!.tenantId, key],
        )
      ).map((r) => r.formKey);
      for (const form of ["main", "quickCreate", "quickView", "lookup"])
        expect(formKeys).toContain(form);
    }

    // The same, as the user sees it: the Standard module's view menu and command bar.
    await openWeb(page, BASE_URLS.web, tenant!, listUrl(KEYS.deal));
    await settle();
    expect(await visibleCommands()).toEqual(
      expect.arrayContaining(["New", "Refresh"]),
    );
    await page.getByRole("button", { name: /^All / }).click();
    for (const view of [
      "Active LAcc Deals",
      "Inactive LAcc Deals",
      "My LAcc Deals",
    ])
      await expect(page.getByText(view, { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");

    await openWeb(page, BASE_URLS.web, tenant!, listUrl(KEYS.ledger));
    await settle();
    await page.getByRole("button", { name: /^All / }).click();
    for (const view of [
      "Active LAcc Ledgers",
      "Inactive LAcc Ledgers",
      "My LAcc Ledgers",
    ])
      await expect(page.getByText(view, { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("L3 — create, edit, deactivate, activate and delete a record in the UI", async () => {
    await openWeb(page, BASE_URLS.web, tenant!, listUrl(KEYS.deal));
    await settle();
    await page.getByRole("button", { name: "New" }).click();
    await page.waitForURL(/\/new/, { timeout: 60_000 });
    await page.getByLabel("Name").fill("Created in UI");
    await page.getByLabel("Stage").fill("Open");
    await page.getByRole("button", { name: "Save & Close" }).click();
    await page.waitForURL(
      (u) => !/\/new/.test(u.pathname) && u.pathname.includes(KEYS.deal),
      { timeout: 60_000 },
    );
    const created = await db(
      `select r.id, r.values, r."isActive", r."ownerUserId" from "CustomDataRecord" r join "CustomizationTable" t on t.id = r."tableId" where t."tenantId" = $1 and t."tableKey" = $2`,
      [tenant!.tenantId, KEYS.deal],
    );
    expect(created).toHaveLength(1);
    expect(created[0].values).toMatchObject({
      dd_name: "Created in UI",
      dd_stage: "Open",
    });
    expect(created[0].isActive).toBe(true);
    expect(created[0].ownerUserId).toBeTruthy();
    const id = created[0].id as string;

    // Edit
    await openWeb(
      page,
      BASE_URLS.web,
      tenant!,
      `/custom-modules/${KEYS.deal}/${id}`,
    );
    await page.getByRole("button", { name: "Edit" }).click();
    await page.waitForURL(/\/edit/, { timeout: 60_000 });
    await page.getByLabel("Stage").fill("Won");
    await page.getByRole("button", { name: "Save & Close" }).click();
    await expect
      .poll(
        async () =>
          (
            await db(`select values from "CustomDataRecord" where id = $1`, [
              id,
            ])
          )[0]?.values?.dd_stage,
        { timeout: 30_000 },
      )
      .toBe("Won");

    // Deactivate from the list (selection → More commands)
    const toggle = async (label: "Deactivate" | "Activate") => {
      await openWeb(page, BASE_URLS.web, tenant!, listUrl(KEYS.deal));
      await settle();
      await page.locator("tbody input[type=checkbox]").first().check();
      await openMoreCommands();
      await page.getByRole("menuitem", { name: label, exact: true }).click();
      const confirm = page.getByRole("dialog").getByRole("button", {
        name: new RegExp(`^${label}$`),
      });
      if (await confirm.count()) await confirm.click();
    };
    await toggle("Deactivate");
    await expect
      .poll(
        async () =>
          (
            await db(
              `select "isActive" from "CustomDataRecord" where id = $1`,
              [id],
            )
          )[0]?.isActive,
        { timeout: 30_000 },
      )
      .toBe(false);
    await toggle("Activate");
    await expect
      .poll(
        async () =>
          (
            await db(
              `select "isActive" from "CustomDataRecord" where id = $1`,
              [id],
            )
          )[0]?.isActive,
        { timeout: 30_000 },
      )
      .toBe(true);

    // Delete (supported for a Standard module)
    await openWeb(page, BASE_URLS.web, tenant!, listUrl(KEYS.deal));
    await settle();
    await page.locator("tbody input[type=checkbox]").first().check();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db(
              `select "isDeleted" from "CustomDataRecord" where id = $1`,
              [id],
            )
          )[0]?.isDeleted,
        { timeout: 30_000 },
      )
      .toBe(true);
    await openWeb(page, BASE_URLS.web, tenant!, listUrl(KEYS.deal));
    await expect(page.getByText("No records yet.")).toBeVisible();
  });

  test("L4 — Quick Create works, and the module carries Main, Quick Create, Quick View and Lookup forms", async () => {
    await openWeb(page, BASE_URLS.web, tenant!, `${listUrl(KEYS.deal)}`);
    await settle();
    await page.getByRole("button", { name: "New" }).click();
    await page.waitForURL(/\/new/, { timeout: 60_000 });
    const picker = page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: "Quick Create" }) });
    await expect(picker.locator("option")).toHaveText([
      "Main Form",
      "Minimal Form",
      "Quick Create",
    ]);
    await picker.selectOption({ label: "Quick Create" });
    await page.waitForURL(/formId=/, { timeout: 30_000 });
    await page.getByLabel("Name").fill("Quick created");
    await page.getByRole("button", { name: "Save & Close" }).click();
    await expect
      .poll(
        async () =>
          (
            await db(
              `select count(*)::int as n from "CustomDataRecord" r join "CustomizationTable" t on t.id = r."tableId" where t."tenantId" = $1 and t."tableKey" = $2 and r.values->>'dd_name' = 'Quick created' and not r."isDeleted"`,
              [tenant!.tenantId, KEYS.deal],
            )
          )[0].n,
        { timeout: 30_000 },
      )
      .toBe(1);
    // Quick View has no screen yet: it is verified as a persisted, non-empty form.
    const [quickView] = await db(
      `select f."layoutJson" from "CustomizationForm" f join "CustomizationTable" t on t.id = f."tableId" where t."tenantId" = $1 and t."tableKey" = $2 and f."formKey" = 'quickView'`,
      [tenant!.tenantId, KEYS.deal],
    );
    expect(quickView).toBeTruthy();
  });

  test("L5 — Immutable and Configuration modules offer no prohibited actions, and the API refuses them", async () => {
    // Immutable: create works, nothing else.
    const made = await api<{ id: string }>("POST", `/data/${KEYS.ledger}`, {
      dd_name: "Entry 1",
      dd_stage: "Posted",
    });
    expect(made.status).toBe(201);
    await openWeb(page, BASE_URLS.web, tenant!, listUrl(KEYS.ledger));
    await settle();
    await page.locator("tbody input[type=checkbox]").first().check();
    const ledgerCommands = await visibleCommands();
    expect(ledgerCommands).not.toContain("Delete");
    // Nothing is left to put in the overflow menu, so it is not offered at all.
    await expect(
      page.getByRole("button", { name: "More commands" }),
    ).toHaveCount(0);
    await openWeb(
      page,
      BASE_URLS.web,
      tenant!,
      `/custom-modules/${KEYS.ledger}/${made.json.id}`,
    );
    const recordCommands = await visibleCommands();
    for (const label of ["Edit", "Delete", "Deactivate"])
      expect(recordCommands).not.toContain(label);
    expect(
      (
        await api("PATCH", `/data/${KEYS.ledger}/${made.json.id}`, {
          dd_stage: "Changed",
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await api("PATCH", `/data/${KEYS.ledger}/${made.json.id}`, {
          isActive: false,
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (await api("DELETE", `/data/${KEYS.ledger}/${made.json.id}`)).status,
    ).toBeGreaterThanOrEqual(400);
    const [ledgerRow] = await db(
      `select values, "isActive", "isDeleted" from "CustomDataRecord" where id = $1`,
      [made.json.id],
    );
    expect(ledgerRow).toMatchObject({ isActive: true, isDeleted: false });
    expect(ledgerRow.values.dd_stage).toBe("Posted");

    // Configuration: edit and deactivate yes, delete never.
    const setting = await api<{ id: string }>("POST", `/data/${KEYS.config}`, {
      dd_name: "Setting 1",
      dd_stage: "On",
    });
    expect(setting.status).toBe(201);
    expect(
      (
        await api("PATCH", `/data/${KEYS.config}/${setting.json.id}`, {
          dd_stage: "Off",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api("PATCH", `/data/${KEYS.config}/${setting.json.id}`, {
          isActive: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (await api("DELETE", `/data/${KEYS.config}/${setting.json.id}`)).status,
    ).toBeGreaterThanOrEqual(400);
    await openWeb(page, BASE_URLS.web, tenant!, listUrl(KEYS.config));
    await settle();
    await page.locator("tbody input[type=checkbox]").first().check();
    expect(await visibleCommands()).not.toContain("Delete");
    const [configRow] = await db(
      `select "isDeleted", "isActive" from "CustomDataRecord" where id = $1`,
      [setting.json.id],
    );
    expect(configRow).toMatchObject({ isDeleted: false, isActive: false });
  });

  test("L6 — a lookup relates two custom modules; bad references and anonymous callers are refused", async () => {
    const column = await api(
      "POST",
      `/customization/tables/${KEYS.ledger}/columns`,
      {
        columnKey: "dd_deal",
        displayName: "Deal",
        dataType: "lookup",
        lookupTargetTableKey: KEYS.deal,
      },
    );
    expect(column.status, column.text.slice(0, 300)).toBe(201);
    expect((await api("POST", "/customization/publish")).status).toBe(201);

    const deal = await api<{ id: string }>("POST", `/data/${KEYS.deal}`, {
      dd_name: "Parent deal",
    });
    expect(deal.status).toBe(201);
    const child = await api<{ id: string }>("POST", `/data/${KEYS.ledger}`, {
      dd_name: "Entry with deal",
      dd_deal: deal.json.id,
    });
    expect(child.status, child.text.slice(0, 300)).toBe(201);
    const [stored] = await db(
      `select values from "CustomDataRecord" where id = $1`,
      [child.json.id],
    );
    expect(stored.values.dd_deal).toBe(deal.json.id);

    // The record screen resolves the related record rather than printing a raw id.
    await openWeb(
      page,
      BASE_URLS.web,
      tenant!,
      `/custom-modules/${KEYS.ledger}/${child.json.id}`,
    );
    await settle();
    await expect(page.getByLabel("Deal", { exact: true })).toHaveValue("Parent deal");

    // A reference to nothing is refused, not stored.
    const dangling = await api("POST", `/data/${KEYS.ledger}`, {
      dd_name: "Dangling",
      dd_deal: "00000000-0000-4000-8000-000000000000",
    });
    expect(dangling.status).toBeGreaterThanOrEqual(400);

    // Anonymous: no session, no data.
    const anonymous = await page.context().browser()!.newContext();
    const anon = await anonymous.request.get(
      `${BASE_URLS.api}/data/${KEYS.deal}`,
    );
    expect([401, 403]).toContain(anon.status());
    await anonymous.close();
  });

  test("L7 — package: export, strip defaults, import, and re-import (idempotent, customizations kept)", async () => {
    const created = await api<{ id: string; prefix: string }>(
      "POST",
      "/customization/packages",
      {
        packageKey: PKG_KEY,
        displayName: "LAcc Package",
        publisherName: "KLAcc",
        version: "1.0.0",
      },
    );
    expect(created.status, created.text.slice(0, 300)).toBe(201);
    const packageId = created.json.id;
    const table = await api("POST", "/customization/tables", {
      packageId,
      tableKey: PKG_TABLE,
      displayName: PKG_DISPLAY,
      pluralDisplayName: "LAcc Assets",
    });
    expect(table.status, table.text.slice(0, 300)).toBe(201);
    for (const col of [
      {
        columnKey: `${PKG_PREFIX}_name`,
        displayName: "Name",
        isPrimaryName: true,
      },
      { columnKey: `${PKG_PREFIX}_grade`, displayName: "Grade" },
    ]) {
      const res = await api(
        "POST",
        `/customization/tables/${PKG_TABLE}/columns`,
        {
          packageId,
          dataType: "text",
          ...col,
        },
      );
      expect(res.status, res.text.slice(0, 300)).toBe(201);
    }
    const before = await moduleCounts(PKG_TABLE);
    expect(before.views).toBe(7);
    expect(before.forms).toBe(4);

    expect((await api("POST", "/customization/publish")).status).toBe(201);
    const released = await api(
      "POST",
      `/customization/packages/${packageId}/release`,
      {
        notes: "Flow L",
      },
    );
    expect(released.status, released.text.slice(0, 400)).toBe(201);
    const exported = await api(
      "GET",
      `/customization/packages/${packageId}/versions/latest/artifact`,
    );
    expect(exported.status).toBe(200);
    const artifact = JSON.parse(exported.text);
    expect(exported.text).not.toContain(tenant!.tenantId);

    // A package that carries the module and its fields, but none of the default views/forms/action bar.
    const stripped = JSON.parse(exported.text);
    stripped.components = stripped.components.filter((c: any) =>
      ["table", "column"].includes(c.type),
    );
    const keep = new Set(stripped.components.map((c: any) => c.key));
    for (const c of stripped.components)
      c.dependsOn = (c.dependsOn ?? []).filter((d: string) => keep.has(d));
    expect(artifact.components.length).toBeGreaterThan(
      stripped.components.length,
    );
    const strippedText = reseal(stripped);

    // Remove the module and its package from this workspace so the import is an INSTALL that creates it.
    const t = tenant!.tenantId;
    await db(
      `delete from "CustomizationSolutionComponent" where "tenantId" = $1 and "solutionId" = $2`,
      [t, packageId],
    );
    await db(
      `delete from "CustomizationTable" where "tenantId" = $1 and "tableKey" = $2`,
      [t, PKG_TABLE],
    );
    await db(
      `delete from "CustomizationPackageVersion" where "tenantId" = $1 and "packageId" = $2`,
      [t, packageId],
    );
    await db(
      `delete from "CustomizationSolution" where "tenantId" = $1 and id = $2`,
      [t, packageId],
    );

    const analysis = await uploadPackage(strippedText);
    expect(analysis.status, analysis.text.slice(0, 500)).toBe(201);
    expect(
      analysis.json.status,
      JSON.stringify(analysis.json).slice(0, 600),
    ).toBe("READY");
    const applied = await api(
      "POST",
      `/customization/package-imports/${analysis.json.id}/execute`,
      {},
    );
    expect(applied.status, applied.text.slice(0, 500)).toBe(201);
    expect(applied.json.status).toBe("COMPLETED");

    // The package did not carry the defaults; the import provisioned them for the module it created.
    const first = await moduleCounts(PKG_TABLE);
    expect(first.views).toBe(7);
    expect(first.forms).toBe(4);
    expect(first.columns).toBe(2);

    // A manual customization after the import…
    await db(
      `update "CustomizationView" v set "name" = 'Mine only renamed' from "CustomizationTable" t where t.id = v."tableId" and t."tenantId" = $1 and t."tableKey" = $2 and v."viewKey" = 'recent'`,
      [t, PKG_TABLE],
    );
    // …survives a second import of the same package.
    const again = await uploadPackage(strippedText);
    expect(again.status, again.text.slice(0, 500)).toBe(201);
    if (again.json.status === "READY") {
      const reapplied = await api(
        "POST",
        `/customization/package-imports/${again.json.id}/execute`,
        {},
      );
      expect(reapplied.status, reapplied.text.slice(0, 500)).toBeLessThan(500);
    }
    const second = await moduleCounts(PKG_TABLE);
    expect(second).toMatchObject({ views: 7, forms: 4, columns: 2 });
    const [renamed] = await db(
      `select v."name" from "CustomizationView" v join "CustomizationTable" t on t.id = v."tableId" where t."tenantId" = $1 and t."tableKey" = $2 and v."viewKey" = 'recent'`,
      [t, PKG_TABLE],
    );
    expect(renamed.name).toBe("Mine only renamed");
    const duplicates = await db(
      `select v."viewKey", count(*)::int n from "CustomizationView" v join "CustomizationTable" t on t.id = v."tableId" where t."tenantId" = $1 and t."tableKey" = $2 group by 1 having count(*) > 1`,
      [t, PKG_TABLE],
    );
    expect(duplicates).toEqual([]);
    const tables = await db(
      `select count(*)::int n from "CustomizationTable" where "tenantId" = $1 and "tableKey" = $2`,
      [t, PKG_TABLE],
    );
    expect(tables[0].n).toBe(1);
  });

  test("L8 — mobile: the list and the form fit a 375px screen", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    try {
      await api("POST", `/data/${KEYS.deal}`, { dd_name: "Mobile record" });
      await openWeb(page, BASE_URLS.web, tenant!, listUrl(KEYS.deal));
      await settle();
      await expect(page.getByText("Mobile record")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, "page scrolls sideways at 375px").toBeLessThanOrEqual(1);
      await page.getByRole("button", { name: "New" }).click();
      await page.waitForURL(/\/new/, { timeout: 60_000 });
      await expect(page.getByLabel("Name")).toBeVisible();
      const box = await page.getByLabel("Name").boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      const formOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(formOverflow).toBeLessThanOrEqual(1);
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });
});
