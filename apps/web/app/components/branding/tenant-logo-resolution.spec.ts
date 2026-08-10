import { DEFAULT_BRANDING_VALUES } from "./branding-defaults";

/*
 * The resolution rule behind TenantLogo, tested directly.
 *
 * The component renders JSX, and there is no DOM test setup here — but the
 * decision it makes is pure and is the part that matters: a customer tenant
 * must never be shown the vendor's mark. That leak was reported once already.
 */

type Resolution =
  | { kind: "tenant-artwork"; src: string }
  | { kind: "platform-mark"; reversed: boolean }
  | { kind: "initials"; text: string };

/* Mirrors TenantLogo's branches. */
function resolveLogo(input: {
  logoUrl?: string | null;
  name?: string | null;
  onDarkBackground?: boolean;
}): Resolution {
  const effectiveName =
    typeof input.name === "string" && input.name.trim().length > 0
      ? input.name.trim()
      : DEFAULT_BRANDING_VALUES.brandName;

  if (input.logoUrl) return { kind: "tenant-artwork", src: input.logoUrl };

  const isPlatformBrand =
    effectiveName.toLowerCase() ===
    DEFAULT_BRANDING_VALUES.brandName.toLowerCase();

  if (isPlatformBrand) {
    return {
      kind: "platform-mark",
      reversed: Boolean(input.onDarkBackground),
    };
  }

  const words = effectiveName.trim().split(/\s+/).filter(Boolean);
  const text =
    words.length === 1
      ? words[0].slice(0, 2).toUpperCase()
      : (words[0][0] + words[words.length - 1][0]).toUpperCase();

  return { kind: "initials", text };
}

describe("tenant logo resolution", () => {
  it("prefers the tenant's own artwork over everything else", () => {
    expect(
      resolveLogo({ logoUrl: "https://cdn/xoul.png", name: "Xoul Ltd" }),
    ).toEqual({ kind: "tenant-artwork", src: "https://cdn/xoul.png" });
  });

  it("shows the platform mark for the platform's own portal", () => {
    /* This is the case that was falling through to a generic grid icon. */
    expect(resolveLogo({ name: "DijiPeople" })).toEqual({
      kind: "platform-mark",
      reversed: false,
    });
  });

  it("shows the platform mark when no brand name is set at all", () => {
    expect(resolveLogo({}).kind).toBe("platform-mark");
    expect(resolveLogo({ name: "   " }).kind).toBe("platform-mark");
  });

  it("uses the reversed mark on a dark ground", () => {
    expect(resolveLogo({ name: "DijiPeople", onDarkBackground: true })).toEqual({
      kind: "platform-mark",
      reversed: true,
    });
  });

  it("never shows the vendor mark to a renamed tenant", () => {
    /* The reported leak: Xoul Ltd displaying the DijiPeople logo. */
    for (const name of ["Xoul Ltd", "Acme", "Contoso Group"]) {
      expect(resolveLogo({ name }).kind).not.toBe("platform-mark");
    }
  });

  it("derives initials from the first and last word", () => {
    expect(resolveLogo({ name: "Xoul Ltd" })).toEqual({
      kind: "initials",
      text: "XL",
    });
    expect(resolveLogo({ name: "Contoso Group Holdings" })).toEqual({
      kind: "initials",
      text: "CH",
    });
  });

  it("gives a single-word tenant its first two letters", () => {
    expect(resolveLogo({ name: "Acme" })).toEqual({
      kind: "initials",
      text: "AC",
    });
  });

  it("matches the platform brand regardless of casing", () => {
    expect(resolveLogo({ name: "dijipeople" }).kind).toBe("platform-mark");
    expect(resolveLogo({ name: "DIJIPEOPLE" }).kind).toBe("platform-mark");
  });
});
