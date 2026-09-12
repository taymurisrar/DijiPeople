import type { SessionUser } from "@/lib/auth";

/*
 * BUG-3374 — `/settings/customization` and its twelve child routes silently
 * redirected to Roles for the workspace owner. `requireCustomizationAccess`
 * gated on role membership (`GLOBAL_ADMIN`/`SYSTEM_CUSTOMIZER`) only, while
 * the navigation catalog and every page under the section gate on the
 * `customization.read` permission via `requireSettingsPermissions` — a
 * tenant owner holding the permission but neither role passed every page's
 * own check and still never got there, because the layout's stricter,
 * disagreeing model ran first and redirected before any page could.
 *
 * This is the regression test the bug record asked for, adapted to what
 * `apps/web`'s jest can run: it has no jsdom and cannot request a route and
 * follow a redirect, but `requireCustomizationAccess` is a plain async
 * function once `getSessionUser` is mocked, and the whole defect was a
 * one-function decision.
 */

jest.mock("@/lib/auth", () => ({
  getSessionUser: jest.fn(),
}));

import { getSessionUser } from "@/lib/auth";
import { requireCustomizationAccess } from "./require-settings-permission";

const mockGetSessionUser = getSessionUser as jest.MockedFunction<
  typeof getSessionUser
>;

function userWith(roleKeys: string[], permissionKeys: string[]): SessionUser {
  return {
    sub: "user-1",
    userId: "user-1",
    tenantId: "tenant-1",
    tenantSlug: "acme",
    tenantName: "Acme",
    email: "owner@acme.test",
    firstName: "Owner",
    lastName: "Acme",
    roleIds: [],
    roleKeys,
    roles: [],
    permissionKeys,
  };
}

describe("requireCustomizationAccess", () => {
  beforeEach(() => {
    mockGetSessionUser.mockReset();
  });

  it("allows the exact regression case: permission held, neither administrator role", async () => {
    // The workspace owner as reproduced live in BUG-3374.
    mockGetSessionUser.mockResolvedValue(
      userWith([], ["customization.read"]),
    );

    const result = await requireCustomizationAccess(["customization.read"]);

    expect(result.allowed).toBe(true);
  });

  it("still allows a GLOBAL_ADMIN with no explicit permission grant", async () => {
    mockGetSessionUser.mockResolvedValue(userWith(["global-admin"], []));

    const result = await requireCustomizationAccess(["customization.read"]);

    expect(result.allowed).toBe(true);
  });

  it("still allows a SYSTEM_CUSTOMIZER with no explicit permission grant", async () => {
    mockGetSessionUser.mockResolvedValue(userWith(["system-customizer"], []));

    const result = await requireCustomizationAccess(["customization.read"]);

    expect(result.allowed).toBe(true);
  });

  it("denies a user with neither the permission nor an administrator role", async () => {
    mockGetSessionUser.mockResolvedValue(userWith(["employee"], []));

    const result = await requireCustomizationAccess(["customization.read"]);

    expect(result.allowed).toBe(false);
  });

  it("denies when there is no session", async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const result = await requireCustomizationAccess(["customization.read"]);

    expect(result.allowed).toBe(false);
    expect(result.user).toBeNull();
  });

  it("matches requireSettingsPermissions's own model rather than a second one", async () => {
    // The bug was two authorization models disagreeing. SYSTEM_ADMIN is in
    // `hasSettingsAdministratorRole` (what every page under this section
    // already uses) but was never in the old, narrower
    // `hasCustomizationAdministratorRole` — so this case would have failed
    // before the fix even though every page would have allowed it.
    mockGetSessionUser.mockResolvedValue(userWith(["system-admin"], []));

    const result = await requireCustomizationAccess(["customization.read"]);

    expect(result.allowed).toBe(true);
  });
});
