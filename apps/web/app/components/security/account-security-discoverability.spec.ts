import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACCOUNT_SECURITY_ANCHOR,
  accountSecurityHref,
} from "./account-security-anchor";

const SHELL = join(__dirname, "../../(authenticated)/_components");
const MY_PROFILE = join(__dirname, "../../(authenticated)/my-profile/page.tsx");

/**
 * Source with comments removed and line endings normalised first — CRLF on
 * Windows, LF on CI — so no assertion passes vacuously on one of them. Same
 * helper as workspace-switcher-placement.spec.ts.
 */
function codeOnly(path: string) {
  return readFileSync(path, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * BUG-3844 — two-factor authentication could not be found.
 *
 * The self-service MFA card was rendered only at the bottom of My Profile,
 * beneath the entire employee form, and nothing linked to it. These assert the
 * two halves of the path a user now follows: the account menu links to the
 * anchor, and every My Profile branch renders the card inside it. Asserted
 * against source because apps/web has no jsdom (see jest.config.js).
 */
describe("BUG-3844 — the MFA card is reachable from the account menu", () => {
  const menu = codeOnly(join(SHELL, "user-menu-dropdown.tsx"));
  const profile = codeOnly(MY_PROFILE);

  it("builds the security link from the profile route and the anchor", () => {
    expect(accountSecurityHref("/my-profile")).toBe(
      `/my-profile#${ACCOUNT_SECURITY_ANCHOR}`,
    );
  });

  it("offers a Security entry in the account menu that targets the anchor", () => {
    expect(menu).toMatch(
      /<Link\s+href=\{accountSecurityHref\(profileHref\)\}[\s\S]*?>\s*Security\s*<\/span>/,
    );
  });

  it("renders every MFA card on My Profile inside the anchor", () => {
    const cards = profile.match(/<MfaSettingsCard \/>/g) ?? [];
    const anchored =
      profile.match(
        /<div[^>]*id=\{ACCOUNT_SECURITY_ANCHOR\}[^>]*>\s*<MfaSettingsCard \/>\s*<\/div>/g,
      ) ?? [];

    // Not empty, or the equality below would describe nothing.
    expect(cards.length).toBeGreaterThan(0);
    expect(anchored).toHaveLength(cards.length);
  });
});
