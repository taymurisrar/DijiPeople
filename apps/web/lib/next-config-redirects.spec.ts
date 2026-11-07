import nextConfig from "../next.config";

/*
 * DP-QA-023 - a page that only redirect()s renders the authenticated shell first,
 * and the client-side redirect then cancels the shell's in-flight link prefetches,
 * which WebKit reports as uncaught "access control checks" page errors. These
 * routes answer with an HTTP redirect instead, before anything renders.
 */
type Redirect = { source: string; destination: string; permanent: boolean };

async function redirects(): Promise<Redirect[]> {
  return (await nextConfig.redirects!()) as Redirect[];
}

describe("HTTP redirects for redirect-only pages (DP-QA-023)", () => {
  it.each([
    ["/employees/import", "/settings/data-management"],
    ["/settings/access", "/settings/security-access"],
    [
      "/settings/security-access/roles",
      "/settings/security-access/authorization/roles",
    ],
  ])("%s redirects to %s over HTTP", async (source, destination) => {
    const rule = (await redirects()).find((r) => r.source === source);
    expect(rule?.destination).toBe(destination);
    expect(rule?.permanent).toBe(false);
  });

  it("never redirects to another redirect (one hop, no chains)", async () => {
    const all = await redirects();
    const sources = new Set(all.filter((r) => !r.source.includes(":")).map((r) => r.source));
    const exact = all.filter((r) => !r.source.includes(":"));
    for (const rule of exact) {
      expect({ from: rule.source, to: rule.destination, chained: sources.has(rule.destination) }).toEqual({
        from: rule.source,
        to: rule.destination,
        chained: false,
      });
    }
  });

  it("lists each source once, so the first match is the intended one", async () => {
    const exact = (await redirects()).filter((r) => !r.source.includes(":"));
    const seen = new Set<string>();
    const dupes = exact.map((r) => r.source).filter((s) => (seen.has(s) ? true : (seen.add(s), false)));
    expect(dupes).toEqual([]);
  });
});
