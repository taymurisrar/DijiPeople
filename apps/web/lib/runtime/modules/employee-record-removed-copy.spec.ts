import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * ITEM-0183 — explanatory copy the product owner removed ("I don't want this
 * extra info ever"). Each entry is the source file that rendered it and a
 * fragment of the sentence, normalised for whitespace so a reflowed comeback
 * is still caught. Restoring any of them fails here.
 */
const APP_ROOT = join(__dirname, "..", "..", "..");

const REMOVED_COPY: readonly (readonly [file: string, fragment: string])[] = [
  [
    "app/(public)/login/login-form.tsx",
    "Keeps you signed in on this browser across restarts",
  ],
  [
    "app/components/runtime/module-widget-renderer.tsx",
    "An avatar and a name at rest",
  ],
  [
    "app/components/runtime/module-widget-renderer.tsx",
    "No work site assignments yet",
  ],
  [
    "app/components/runtime/module-widget-renderer.tsx",
    "has no explicit work site assignment",
  ],
  [
    "app/components/runtime/module-assign-dialog.tsx",
    "updates ownership through the Module data adapter",
  ],
  [
    "app/components/runtime/module-related-subgrid.tsx",
    "apply the same allocation, billing, and approval details",
  ],
];

function normalise(text: string) {
  return text.replace(/\s+/g, " ");
}

describe("removed explanatory copy stays removed", () => {
  it.each(REMOVED_COPY)("%s no longer says %p", (file, fragment) => {
    const source = normalise(readFileSync(join(APP_ROOT, file), "utf8"));
    expect(source).not.toContain(normalise(fragment));
  });
});
