import type { SessionUser } from "@/lib/auth";

/*
 * ADR-0013 / BUG-3491 — the web half of the Customization access rule.
 *
 * BUG-3374's version of this spec asserted that three administrator roles were
 * admitted with no permission at all. That was the web side agreeing with
 * itself while the API disagreed with both: the owner passed here and crashed on
 * the first API call. The rule is now the keys, held outright, on both sides.
 * The API side, and the check that the two sides name the same keys, are in
 * services/api/src/modules/customization/customization-web-gate.seam.spec.ts.
 *
 * `apps/web` jest has no jsdom and cannot request a route, but
 * `requireCustomizationAccess` is a plain async function once `getSessionUser`
 * is mocked, and the decision is the function.
 */

jest.mock("@/lib/auth", () => ({
  getSessionUser: jest.fn(),
}));

import { getSessionUser } from "@/lib/auth";
import {
  hasCustomizationPermissions,
  requireCustomizationAccess,
} from "./require-settings-permission";
import {
  customizationPageKeys,
  requireCustomizationPage,
} from "../customization/_lib/customization-access";

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

  it("admits the workspace owner case: System Administrator holding the keys", async () => {
    mockGetSessionUser.mockResolvedValue(
      userWith(["system-admin"], ["customization.read"]),
    );

    await expect(
      requireCustomizationAccess(["customization.read"]),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("admits a custom role holding the keys", async () => {
    mockGetSessionUser.mockResolvedValue(
      userWith(["tenant-configurator"], ["customization.read"]),
    );

    await expect(
      requireCustomizationAccess(["customization.read"]),
    ).resolves.toMatchObject({ allowed: true });
  });

  it.each(["global-admin", "system-admin", "system-customizer"])(
    "no longer admits %s without the keys",
    async (roleKey) => {
      mockGetSessionUser.mockResolvedValue(userWith([roleKey], []));

      await expect(
        requireCustomizationAccess(["customization.read"]),
      ).resolves.toMatchObject({ allowed: false });
    },
  );

  it("requires every key, not any one", async () => {
    mockGetSessionUser.mockResolvedValue(userWith([], ["customization.read"]));

    await expect(
      requireCustomizationAccess([
        "customization.read",
        "customization.tables.read",
      ]),
    ).resolves.toMatchObject({ allowed: false });
  });

  it("denies when there is no session", async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const result = await requireCustomizationAccess(["customization.read"]);

    expect(result.allowed).toBe(false);
    expect(result.user).toBeNull();
  });

  it("never admits on an empty key list", () => {
    expect(
      hasCustomizationPermissions(userWith(["global-admin"], []), []),
    ).toBe(false);
  });
});

describe("requireCustomizationPage", () => {
  beforeEach(() => {
    mockGetSessionUser.mockReset();
  });

  it("gates the module detail page on every key its API calls need", async () => {
    const keys = customizationPageKeys("moduleDetail");
    expect(keys).toEqual(
      expect.arrayContaining([
        "customization.tables.read",
        "customization.columns.read",
        "customization.views.read",
        "customization.forms.read",
      ]),
    );

    mockGetSessionUser.mockResolvedValue(userWith([], [...keys]));
    await expect(
      requireCustomizationPage("moduleDetail"),
    ).resolves.toMatchObject({ allowed: true });

    mockGetSessionUser.mockResolvedValue(
      userWith(
        [],
        keys.filter((key) => key !== "customization.forms.read"),
      ),
    );
    await expect(
      requireCustomizationPage("moduleDetail"),
    ).resolves.toMatchObject({ allowed: false });
  });
});
