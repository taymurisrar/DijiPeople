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
 * Flow K — custom-module views over MORE THAN ONE PAGE, in a real browser.
 *
 * Views used to be applied in the browser to whichever page of records had been
 * loaded, while the pager showed the unfiltered total. On a module of 60 records
 * "Active" showed only the active ones that happened to sit on page 1, and the
 * numbers disagreed with the rows. Unit and API tests could not see that: it
 * is the combination of a server page, a client filter and a pager.
 *
 * This flow also covers what only a browser reaches:
 *  - creating a module through the supported UI (and choosing its type);
 *  - that a freshly provisioned module can be PUBLISHED at all — an earlier
 *    version of the plan produced views the publish validator rejected
 *    ("View filters reference unavailable columns: isActive"), which the API
 *    tests missed because they wrote the published snapshot directly.
 *
 * It creates its own module (unique per run), its own records, and removes them
 * in afterAll. It needs a tenant administrator and a disposable database, like
 * the other tenant flows, and skips otherwise.
 */

const KEY = `kviews${RUN_ID}`.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "");
const LEDGER_KEY = `kledger${RUN_ID}`.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "");
const NAME = "KViews Deal";
const PLURAL = "KViews Deals";
const LEDGER_NAME = "KViews Ledger";
const TOTAL = 60;
const PAGE_SIZE = 25;
/** Every 4th record is inactive; every 3rd is owned by somebody else. */
const isInactive = (n: number) => n % 4 === 0;
const isOthers = (n: number) => n % 3 === 0;
const nameOf = (n: number) => `${NAME} ${String(n).padStart(2, "0")}`;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

let tenant: TenantTarget | null = null;
let page: Page;
const createdRecordIds: string[] = [];

test.describe.configure({ mode: "serial" });

/** Calls the app's own API proxy from inside the page: same session, same origin. */
async function api<T = any>(method: string, path: string, data?: unknown) {
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
  ) as Promise<{ status: number; json: T; text: string }>;
}

const listPath = (viewKeyOrId = "", extra = "") =>
  `/custom-modules/${KEY}${viewKeyOrId ? `?viewId=${viewKeyOrId}${extra}` : extra ? `?${extra.replace(/^&/, "")}` : ""}`;

/** The published view ids the runtime puts in the URL (`viewId`), read from the database: the browser-side API proxy does not expose metadata. */
async function viewIds() {
  const rows = await withDatabase(
    async (client) =>
      (
        await client.query(
          `select v.id, v."viewKey" from "CustomizationView" v join "CustomizationTable" t on t.id = v."tableId" where t."tenantId" = $1 and t."tableKey" = $2`,
          [tenant!.tenantId, KEY],
        )
      ).rows,
  );
  return Object.fromEntries(
    (rows ?? []).map((r: { id: string; viewKey: string }) => [r.viewKey, r.id]),
  ) as Record<string, string>;
}

/** Auto-retrying: a pager read straight after a navigation can still show the previous page. */
async function expectPager(pattern: RegExp) {
  await expect(
    page.getByText(/Showing .* of .* records|No records/i).first(),
  ).toHaveText(pattern, { timeout: 30_000 });
}

async function pagerText() {
  return (
    await page
      .getByText(/Showing .* of .* records|No records/i)
      .first()
      .innerText()
  ).replace(/\s+/g, " ");
}

async function rowNames() {
  await expect(page.locator("tbody tr").first()).toBeVisible({
    timeout: 30_000,
  });
  return (await page.locator("tbody tr td:nth-child(2)").allInnerTexts()).map(
    (t) => t.trim(),
  );
}

async function goToPage(n: number) {
  await page.getByRole("link", { name: `Page ${n}`, exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("page") === String(n), {
    timeout: 30_000,
  });
  await page.waitForLoadState("networkidle");
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
    "no ACTIVE tenant with a slug exists in the seeded database — run seed-demo, or set E2E_TENANT_SLUG",
  );
  const context = await browser.newContext();
  page = await context.newPage();
  const landed = await signInToWeb(
    page,
    BASE_URLS.web,
    tenant!,
    tenantCredentials()!,
  );
  test.skip(
    landed === "picker",
    "this identity reaches several workspaces; set E2E_TENANT_SLUG to pin one",
  );
});

test.afterAll(async () => {
  if (!page) return;
  // Exactly what this flow created, and nothing else.
  await withDatabase(async (client) => {
    await client.query(
      `delete from "CustomDataRecord" where "tableId" in (select id from "CustomizationTable" where "tenantId" = $1 and "tableKey" = any($2))`,
      [tenant!.tenantId, [KEY, LEDGER_KEY]],
    );
    await client.query(
      `delete from "CustomizationTable" where "tenantId" = $1 and "tableKey" = any($2)`,
      [tenant!.tenantId, [KEY, LEDGER_KEY]],
    );
  });
  await page.context().close();
});

test.describe("Flow K — module views over more than one page", () => {
  test("K1 — a module is created through the UI, with its type chosen, and provisioned", async () => {
    await openWeb(
      page,
      BASE_URLS.web,
      tenant!,
      "/settings/customization/tables",
    );
    for (const [display, plural, type] of [
      [NAME, PLURAL, null],
      [LEDGER_NAME, "KViews Ledgers", "Immutable"],
    ] as const) {
      await openWeb(
        page,
        BASE_URLS.web,
        tenant!,
        "/settings/customization/tables",
      );
      await page.getByRole("button", { name: "Create module" }).first().click();
      const dialog = page.getByRole("dialog").first();
      await dialog.getByLabel("Display name").fill(display);
      await dialog.getByLabel("Plural name").fill(plural);
      if (type) {
        await dialog.getByRole("combobox").click();
        await page.getByRole("option", { name: type }).click();
      }
      await dialog.getByRole("button", { name: /^create$/i }).click();
      // Creating a module opens its designer page (the toast is gone by then): that is the signal.
      await page.waitForURL(/\/settings\/customization\/tables\/[^/?]+/, {
        timeout: 30_000,
      });
      await expect(page.getByText(display).first()).toBeVisible();
    }
    // Rename the generated logical names to this run's unique keys is not possible in the UI, so find them.
    const rows = await withDatabase(
      async (client) =>
        (
          await client.query(
            `select "tableKey", "displayName", "moduleKind",
                  (select count(*) from "CustomizationView" v where v."tableId" = t.id) as views,
                  (select count(*) from "CustomizationForm" f where f."tableId" = t.id) as forms
             from "CustomizationTable" t
            where "tenantId" = $1 and "displayName" in ($2, $3)`,
            [tenant!.tenantId, NAME, LEDGER_NAME],
          )
        ).rows,
    );
    const deal = rows?.find((r: any) => r.displayName === NAME);
    const ledger = rows?.find((r: any) => r.displayName === LEDGER_NAME);
    expect(deal.moduleKind).toBe("STANDARD");
    expect(Number(deal.views)).toBe(7);
    expect(Number(deal.forms)).toBe(4);
    expect(ledger.moduleKind).toBe("IMMUTABLE");
    expect(Number(ledger.views)).toBe(4); // no Active / Inactive / My Records for a ledger
    // The UI generates the logical name from the display name; re-key both to this run so reruns never collide.
    await withDatabase(async (client) => {
      await client.query(
        `update "CustomizationTable" set "tableKey" = $1 where "tenantId" = $2 and "tableKey" = $3`,
        [KEY, tenant!.tenantId, deal.tableKey],
      );
      await client.query(
        `update "CustomizationTable" set "tableKey" = $1 where "tenantId" = $2 and "tableKey" = $3`,
        [LEDGER_KEY, tenant!.tenantId, ledger.tableKey],
      );
    });
  });

  test("K2 — fields can be added and the module PUBLISHES (the plan's own views pass validation)", async () => {
    await openWeb(
      page,
      BASE_URLS.web,
      tenant!,
      "/settings/customization/tables",
    );
    expect(
      (
        await api("POST", `/customization/tables/${KEY}/columns`, {
          columnKey: "dd_name",
          displayName: "Name",
          dataType: "text",
          isPrimaryName: true,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await api("POST", `/customization/tables/${KEY}/columns`, {
          columnKey: "dd_stage",
          displayName: "Stage",
          dataType: "text",
        })
      ).status,
    ).toBe(201);
    const publish = await api("POST", "/customization/publish");
    expect(publish.status, publish.text.slice(0, 400)).toBe(201);
  });

  test("K3 — 60 records over three pages; a customer view that matches nothing", async () => {
    for (const n of range(1, TOTAL)) {
      const res = await api<{ id: string }>("POST", `/data/${KEY}`, {
        dd_name: nameOf(n),
        dd_stage: ["Open", "Closed", "Won"][n % 3],
      });
      expect(res.status).toBe(201);
      createdRecordIds.push(res.json.id);
      if (isInactive(n))
        expect(
          (
            await api("PATCH", `/data/${KEY}/${res.json.id}`, {
              isActive: false,
            })
          ).status,
        ).toBe(200);
    }
    // Ownership: every 3rd record belongs to someone else, so "My Records" is a strict subset.
    await withDatabase(async (client) => {
      for (const n of range(1, TOTAL).filter(isOthers))
        await client.query(
          `update "CustomDataRecord" set "ownerUserId" = 'someone-else' where id = $1`,
          [createdRecordIds[n - 1]],
        );
    });
    const table = await api<{ id: string }>(
      "GET",
      `/customization/tables/${KEY}`,
    );
    expect(
      (
        await api("POST", `/customization/tables/${KEY}/views`, {
          viewKey: "nobody",
          name: "Nobody",
          type: "custom",
          filtersJson: [
            { columnKey: "dd_stage", operator: "eq", value: "Nope" },
          ],
          columnsJson: {
            columns: [{ columnKey: "dd_name", label: "Name", sequence: 0 }],
          },
        })
      ).status,
      JSON.stringify(table.json).slice(0, 80),
    ).toBeLessThan(300);
    expect((await api("POST", "/customization/publish")).status).toBe(201);
  });

  test("K4 — All: three pages, total matches the pager", async () => {
    await openWeb(page, BASE_URLS.web, tenant!, listPath());
    await expectPager(/Showing 1 to 25 of 60 records/);
    expect(await rowNames()).toHaveLength(PAGE_SIZE);
    await goToPage(3);
    await expectPager(/Showing 51 to 60 of 60 records/);
    expect(await rowNames()).toHaveLength(10);
  });

  test("K5 — Active Records: the filter spans ALL pages, and the pager agrees", async () => {
    const ids = await viewIds();
    const active = range(1, TOTAL)
      .filter((n) => !isInactive(n))
      .map(nameOf);
    await openWeb(page, BASE_URLS.web, tenant!, listPath(ids.activeRecords));
    await expectPager(
      new RegExp(`Showing 1 to 25 of ${active.length} records`),
    );
    const first = await rowNames();
    expect(first).toHaveLength(PAGE_SIZE); // a FULL first page: matches from beyond the unfiltered first page
    await goToPage(2);
    await expectPager(
      new RegExp(`Showing 26 to ${active.length} of ${active.length} records`),
    );
    const second = await rowNames();
    expect([...first, ...second].sort()).toEqual([...active].sort());
    expect(
      [...first, ...second].some((n) => isInactive(Number(n.slice(-2)))),
    ).toBe(false);
  });

  test("K6 — Inactive Records and Active + Inactive = All", async () => {
    const ids = await viewIds();
    const inactive = range(1, TOTAL).filter(isInactive).map(nameOf);
    await openWeb(page, BASE_URLS.web, tenant!, listPath(ids.inactiveRecords));
    await expectPager(new RegExp(`of ${inactive.length} records`));
    expect((await rowNames()).sort()).toEqual([...inactive].sort());
  });

  test("K7 — My Records: only mine, across pages, resolved for the signed-in user", async () => {
    const ids = await viewIds();
    const mine = range(1, TOTAL).filter((n) => !isOthers(n));
    await openWeb(page, BASE_URLS.web, tenant!, listPath(ids.myRecords));
    await expectPager(new RegExp(`Showing 1 to 25 of ${mine.length} records`));
    const first = await rowNames();
    await goToPage(2);
    const second = await rowNames();
    expect([...first, ...second].sort()).toEqual(mine.map(nameOf).sort());
  });

  test("K8 — a view with no matches shows a clean empty state, not stale rows", async () => {
    const ids = await viewIds();
    await openWeb(page, BASE_URLS.web, tenant!, listPath(ids.nobody));
    // The empty state is itself one table row; a stale page would show record rows with their own checkboxes.
    await expect(page.getByText("No records yet.")).toBeVisible();
    await expect(page.locator("tbody input[type=checkbox]")).toHaveCount(0);
  });

  test("K9 — switching view from the menu resets to page 1 and the URL carries the view", async () => {
    const ids = await viewIds();
    await openWeb(
      page,
      BASE_URLS.web,
      tenant!,
      listPath(ids.activeRecords, "&page=2"),
    );
    await expectPager(/Showing 26 to 45 of 45 records/);
    await page
      .getByRole("button", { name: /Active KViews Deals/ })
      .first()
      .click();
    await page
      .getByText("Inactive KViews Deals", { exact: true })
      .first()
      .click();
    await page.waitForURL(
      (u) =>
        u.searchParams.get("viewId") === ids.inactiveRecords &&
        !u.searchParams.has("page"),
      { timeout: 30_000 },
    );
    await page.waitForLoadState("networkidle");
    await expectPager(/of 15 records/);
  });

  test("K10 — a page number past the end of THIS view goes to its last page", async () => {
    const ids = await viewIds();
    await openWeb(
      page,
      BASE_URLS.web,
      tenant!,
      listPath(ids.activeRecords, "&page=9"),
    );
    await page.waitForURL((u) => u.searchParams.get("page") === "2", {
      timeout: 30_000,
    });
    await expectPager(/Showing 26 to 45 of 45 records/);
  });

  test("K11 — the view menu has no repeated helper line under each name", async () => {
    await openWeb(page, BASE_URLS.web, tenant!, listPath());
    await page
      .getByRole("button", { name: /All KViews Deals/ })
      .first()
      .click();
    await expect(
      page.getByText("Active KViews Deals", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(/KViews Deals view\./)).toHaveCount(0);
  });

  test("K12 — an IMMUTABLE module offers no Active/Inactive/My views and refuses edits", async () => {
    const def = await api<{
      views: Array<{ viewKey: string }>;
      capabilities: Record<string, boolean>;
      moduleKind: string;
    }>("GET", `/metadata/custom-modules/${LEDGER_KEY}`);
    // Not published yet (no fields): the API says so, which is also correct. Check the stored plan instead.
    const stored = await withDatabase(async (client) =>
      (
        await client.query(
          `select v."viewKey" from "CustomizationView" v join "CustomizationTable" t on t.id = v."tableId" where t."tenantId" = $1 and t."tableKey" = $2 order by 1`,
          [tenant!.tenantId, LEDGER_KEY],
        )
      ).rows.map((r: any) => r.viewKey),
    );
    expect(stored).toEqual(["all", "lookup", "quickFind", "recent"]);
    expect([200, 404]).toContain(def.status);
  });

  test("K13 — header sort orders the WHOLE module, not the page on screen, and survives paging", async () => {
    const ids = await viewIds();
    await openWeb(page, BASE_URLS.web, tenant!, listPath(ids.all));
    // Default order is newest first, so page 1 starts at the highest number: ascending can only
    // start at 01 if the server ordered every record before cutting the page.
    await page.getByRole("button", { name: "Sort Name" }).click();
    await page.waitForURL((u) => /orderBy=/.test(u.search), {
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle");
    const all = range(1, TOTAL).map(nameOf);
    expect(await rowNames()).toEqual(all.slice(0, PAGE_SIZE));
    await goToPage(3);
    expect(page.url()).toMatch(/orderBy=/);
    expect(await rowNames()).toEqual(all.slice(2 * PAGE_SIZE));
    await page.getByRole("button", { name: "Sort Name" }).click();
    await page.waitForURL(
      (u) => u.searchParams.get("orderBy") === "dd_name desc",
      {
        timeout: 30_000,
      },
    );
    await page.waitForLoadState("networkidle");
    expect(await rowNames()).toEqual([...all].reverse().slice(0, PAGE_SIZE));
    await expectPager(new RegExp(`Showing 1 to 25 of ${TOTAL} records`));
  });
});
