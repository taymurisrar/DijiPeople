import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * BUG-3336 — no `loading.tsx`/`error.tsx` under settings/subscription/, a
 * failed load rendered the same `AccessDeniedState` as a genuine permissions
 * refusal, and the UI gate (`hasElevatedTenantRole`) diverged from what the
 * API actually requires. Source-reading, per this app's `AGENTS.md`: no
 * jsdom is installed, so route boundaries and rendered output cannot be
 * exercised here.
 */
const SUBSCRIPTION_DIR = join(__dirname, "..");
const PAGE = readFileSync(
  join(__dirname, "subscription-settings-page.tsx"),
  "utf8",
);
const LOADER = readFileSync(
  join(__dirname, "../_lib/load-subscription-settings.ts"),
  "utf8",
);

describe("BUG-3336 — subscription routes have loading and error boundaries", () => {
  it("loading.tsx exists at the subscription route segment", () => {
    expect(existsSync(join(SUBSCRIPTION_DIR, "loading.tsx"))).toBe(true);
  });

  it("error.tsx exists at the subscription route segment", () => {
    expect(existsSync(join(SUBSCRIPTION_DIR, "error.tsx"))).toBe(true);
  });
});

describe("BUG-3336 — a failed load is distinct from an access-denied refusal", () => {
  it("renders LoadFailureState, not AccessDeniedState, when the data load fails", () => {
    const okFalseBranch = PAGE.slice(PAGE.indexOf("!subscriptionData.ok"));
    expect(okFalseBranch).toMatch(/<LoadFailureState/);
    expect(okFalseBranch).not.toMatch(/<AccessDeniedState/);
  });

  it("still renders AccessDeniedState for the permission refusal", () => {
    const gateBranch = PAGE.slice(0, PAGE.indexOf("!subscriptionData.ok"));
    expect(gateBranch).toMatch(/<AccessDeniedState/);
  });
});

describe("BUG-3336 — the UI gate matches the API's permission key, not hasElevatedTenantRole", () => {
  it("no longer imports or calls hasElevatedTenantRole as the gate", () => {
    // A prose mention explaining the history is fine (and expected); an
    // import or a call is the regression this guards against.
    expect(PAGE).not.toMatch(/import\s*\{[^}]*hasElevatedTenantRole/);
    expect(PAGE).not.toMatch(/hasElevatedTenantRole\(/);
  });

  it("gates on the billing.view permission via the shared settings-permission helper", () => {
    expect(PAGE).toContain("hasSettingsPermission");
    expect(PAGE).toContain("PERMISSION_KEYS.BILLING_VIEW");
  });
});

describe("BUG-3336 — invoices are fetched only for the Billing History view", () => {
  it("skips the /billing/invoices request for other views", () => {
    expect(LOADER).toContain('activeView === "billing-history"');
  });
});
