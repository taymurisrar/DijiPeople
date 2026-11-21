import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * The renderer pages carry the only Content-Security-Policy the agent has, as a
 * <meta> tag. A <meta> CSP can be weakened by an ordinary HTML edit and nothing
 * would notice, so these checks pin the properties that matter. They read the
 * source HTML, not a running window: they prove what the policy says, not how
 * Electron enforces it (that needs a real device, ITEM-0234).
 */
const RENDERER_DIR = path.join(__dirname, "..", "renderer");
const PAGES = [
  "login.html",
  "device-permissions.html",
  "location-request.html",
];

function csp(html: string): string {
  const match = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(
    html,
  );
  if (!match) throw new Error("no Content-Security-Policy meta tag");
  return match[1];
}

describe.each(PAGES)("%s", (page) => {
  const html = readFileSync(path.join(RENDERER_DIR, page), "utf8");
  const policy = csp(html);
  const directive = (name: string) =>
    policy
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `));

  it("starts from default-src 'self'", () => {
    expect(directive("default-src")).toBe("default-src 'self'");
  });

  it("allows scripts from the page's own origin only, never inline or eval", () => {
    expect(directive("script-src")).toBe("script-src 'self'");
  });

  it("forbids plugins, a rewritten base URL and form submission", () => {
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'none'");
    expect(directive("form-action")).toBe("form-action 'none'");
  });

  it("allows no remote origin", () => {
    expect(policy).not.toMatch(/https?:|\*/);
  });

  it("has no inline script or inline event handler", () => {
    const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>/i.test(html);
    expect(inlineScript).toBe(false);
    expect(/\son[a-z]+\s*=/i.test(html)).toBe(false);
  });
});
