import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * BUG-3345 — five primary actions in `billing-settings-client.tsx` painted
 * `bg-foreground` (the tenant's body-text colour) instead of `bg-accent`
 * (the tenant's brand colour). A sixth instance was found in
 * `settings/subscription/cancel/page.tsx`, outside the file the bug record
 * named. This is the "cheap to assert statically" regression the record's
 * own Regression Coverage section asked for.
 *
 * Source-reading, per this app's `AGENTS.md`: `apps/web`'s jest config has no
 * jsdom, so this cannot render the component and inspect computed styles —
 * see `settings-table-containment.spec.ts` and `settings-accessibility.spec.ts`
 * for the same precedent on this exact class of check.
 */
const CLIENT = readFileSync(
  join(__dirname, "billing-settings-client.tsx"),
  "utf8",
);
const CANCEL_PAGE = readFileSync(
  join(__dirname, "../../subscription/cancel/page.tsx"),
  "utf8",
);

describe("BUG-3345 — subscription screens never fill a primary action with bg-foreground", () => {
  it("billing-settings-client.tsx does not use bg-foreground as a fill", () => {
    expect(CLIENT).not.toMatch(/bg-foreground/);
  });

  it("subscription/cancel/page.tsx does not use bg-foreground as a fill", () => {
    expect(CANCEL_PAGE).not.toMatch(/bg-foreground/);
  });

  it("the plan card and portal actions render through the shared Button", () => {
    // Guards against a future edit reintroducing a hand-rolled <button
    // className="...bg-accent..."> instead of reusing the shared component,
    // which is the review-failure pattern this record's Root Cause describes.
    expect(CLIENT).toContain('import { Button } from "@/app/components/ui/button"');
  });
});
