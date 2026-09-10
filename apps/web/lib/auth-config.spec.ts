import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { isProtectedRoute, PROTECTED_ROUTE_PREFIXES } from "./auth-config";

/*
 * ITEM-0111 — PROTECTED_ROUTE_PREFIXES omitted twelve authenticated route
 * trees, so an anonymous request to one of them was let through by the proxy
 * instead of being redirected to sign-in with its destination preserved.
 * Nothing was ever unauthenticated-reachable either way (both real access
 * controls — the proxy's session-cookie check where it does run, and the
 * authenticated layout's own session check — always held); the defect was
 * that the wrong layer caught the request and the `next` deep link was lost.
 *
 * The proposed fix explicitly warns that adding the missing strings only
 * "fixes today, and only today." This test is the part meant to outlive that
 * fix: it walks the real route tree under `app/(authenticated)/` and fails
 * the moment a new top-level route directory is added without a matching
 * entry in the list, rather than relying on someone remembering to update a
 * hand-maintained array again.
 */

const AUTHENTICATED_APP_DIR = join(
  __dirname,
  "..",
  "app",
  "(authenticated)",
);

/** Directories that are not routes: shared helpers, not URL segments. */
const NON_ROUTE_DIR_PATTERN = /^[_.]/;

function authenticatedRouteTrees(): string[] {
  return readdirSync(AUTHENTICATED_APP_DIR)
    .filter((entry) => !NON_ROUTE_DIR_PATTERN.test(entry))
    .filter((entry) =>
      statSync(join(AUTHENTICATED_APP_DIR, entry)).isDirectory(),
    )
    .filter((entry) => !entry.startsWith("[")); // dynamic segments, not a fixed prefix
}

describe("ITEM-0111 — every authenticated route tree has a protected prefix", () => {
  const routeTrees = authenticatedRouteTrees();

  it("finds route trees to check", () => {
    // Guards the guard: a broken path here would make every case below
    // vacuously pass with an empty list.
    expect(routeTrees.length).toBeGreaterThan(20);
  });

  it.each(routeTrees)("app/(authenticated)/%s is a protected prefix", (dir) => {
    const prefix = `/${dir}`;
    expect(PROTECTED_ROUTE_PREFIXES as readonly string[]).toContain(prefix);
  });

  it.each(routeTrees)(
    "an anonymous request to /%s is recognised as protected",
    (dir) => {
      expect(isProtectedRoute(`/${dir}`)).toBe(true);
      expect(isProtectedRoute(`/${dir}/some-child-page`)).toBe(true);
    },
  );
});

describe("ITEM-0111 — the twelve previously-missing trees, by name", () => {
  /*
   * The record's live A/B: `/approvals` (unlisted) lost its deep link while
   * `/employees` (listed) kept it. Pinned by name, not only by the directory
   * walk above, so a reader can see exactly what changed.
   */
  const previouslyMissing = [
    "/access-denied",
    "/approvals",
    "/benefits",
    "/dlp-review",
    "/employee-bank-accounts",
    "/executive",
    "/hr",
    "/inbox",
    "/loans",
    "/manager",
    "/my-preferences",
    "/profile",
  ];

  it.each(previouslyMissing)("%s is now protected", (route) => {
    expect(isProtectedRoute(route)).toBe(true);
  });
});

describe("ITEM-0111 — matchesPrefix root special-case still holds", () => {
  // "/" must never become a de facto catch-all: matchesPrefix special-cases
  // it to match only the exact root, so a route genuinely missing from the
  // list still has to be added by name.
  it("does not treat an arbitrary unlisted path as protected via the root entry", () => {
    expect(isProtectedRoute("/some-future-route-nobody-added-yet")).toBe(
      false,
    );
  });

  it("still protects the exact root", () => {
    expect(isProtectedRoute("/")).toBe(true);
  });
});
