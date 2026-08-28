import { readFileSync } from "node:fs";
import { join } from "node:path";

const ENV = join(__dirname, "env.ts");
const FORM = join(__dirname, "../app/subscribe/subscribe-form.tsx");
const STEPS = join(__dirname, "../app/subscribe/onboarding-steps.tsx");

function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

/**
 * BUG-1544 — the signup wizard advertised a workspace address that did not
 * resolve.
 *
 * Step 2 told a prospective customer that `<slug>.dijipeople.com` "is
 * available". Workspaces are served from `<slug>.ws.dijipeople.com`, which the
 * success page and the provisioned tenant both used correctly — so the only
 * wrong statement was the one made while they were deciding to buy.
 *
 * The value was build-time configuration and production now serves the correct
 * one, measured 2026-08-28. What is asserted here is the property that keeps it
 * correct: there is one resolver, and the wizard does not grow a second answer.
 * That is BUG-0017's shape and REG-271's, one app over.
 */
describe("BUG-1544 — the wizard has no opinion of its own about the domain", () => {
  const env = read(ENV);

  it("resolves the tenant base domain through the shared config", () => {
    expect(env).toContain(
      "getPlatformDomainConfig(process.env).tenantBaseDomain",
    );
  });

  it("does not read the domain out of the environment itself", () => {
    /*
     * The resolver knows the four variable names this value has been called
     * over the years. A local `process.env.TENANT_BASE_DOMAIN` here would
     * answer correctly today and differently from the API that issues the
     * hostname the first time one of the aliases is the one that is set.
     */
    const code = env.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(
      /process\.env\.(NEXT_PUBLIC_)?(TENANT_BASE_DOMAIN|TENANT_ROOT_DOMAIN|WEB_ROOT_DOMAIN)/,
    );
  });
});

/**
 * The other half of this record, and the one it asks to confirm *before*
 * changing any display string: a check against the wrong hostname would keep
 * answering "available" for the right one.
 *
 * It does not send a hostname. The slug goes to the API, which composes the
 * address with its own configuration — so the check was always asking about the
 * right thing, and only the sentence shown to the buyer was wrong.
 */
describe("BUG-1544 — availability is checked by slug, not by hostname", () => {
  const form = read(FORM);
  const steps = read(STEPS);

  it("asks the API about the slug", () => {
    expect(form).toContain("workspace-address?value=");
    expect(form).toContain("encodeURIComponent(currentSlug)");
  });

  it("sends no composed hostname with the check", () => {
    const request = form.slice(
      form.indexOf("workspace-address?value=") - 200,
      form.indexOf("workspace-address?value=") + 200,
    );
    expect(request).not.toContain("tenantBaseDomain");
  });

  it("displays the domain it was given rather than composing another", () => {
    // The step renders `{slug}.{tenantBaseDomain}` from the prop. There is no
    // second source here to disagree with the first.
    expect(steps).toContain("{slug}.{tenantBaseDomain}");
    expect(steps).not.toMatch(/["']dijipeople\.com["']/);
  });
});
