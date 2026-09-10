/*
 * ITEM-0107 — the tenant app carried four implementations of "list the
 * tenant's users": the settings-runtime one (canonical, the only one that
 * ever worked), a bespoke `/users` screen (BUG-2003 — fixed to render, but
 * still a second answer to the same question), and two trees already dead
 * because `next.config.ts` redirected them
 * (`/settings/access/users`, `/settings/security-access/users`).
 *
 * The bespoke screen and both dead trees are now deleted, and `/users` joins
 * the redirect list rather than staying a second implementation — the same
 * mechanism already used for the other two, so a fourth way to reach the same
 * screen never grows back the same way.
 */
import nextConfig from "./next.config";

async function redirectFor(path: string) {
  const redirects = await nextConfig.redirects?.();
  return redirects?.find((entry) => entry.source === path);
}

describe("ITEM-0107 — /users redirects to the canonical Users screen", () => {
  it("redirects /users itself", async () => {
    const redirect = await redirectFor("/users");
    expect(redirect?.destination).toBe(
      "/settings/security-access/identities/users",
    );
  });

  it("redirects every sub-path under /users, matching the pattern used for the other retired trees", async () => {
    const redirect = await redirectFor("/users/:path*");
    expect(redirect?.destination).toBe(
      "/settings/security-access/identities/users/:path*",
    );
  });

  it("the two previously-dead trees are still redirected", async () => {
    expect((await redirectFor("/settings/access/users"))?.destination).toBe(
      "/settings/security-access/identities/users",
    );
    expect(
      (await redirectFor("/settings/security-access/users"))?.destination,
    ).toBe("/settings/security-access/identities/users");
  });
});
