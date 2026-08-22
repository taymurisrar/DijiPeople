import { openWith } from "./open-external";

/**
 * A control that claims an outcome it never checked.
 *
 * "Open Tenant" showed "Tenant workspace opened." and opened nothing. It passed
 * `"noopener,noreferrer"` as `window.open`'s **features** argument, which makes
 * Chrome treat the call as a request for a popup *window* rather than a tab —
 * commonly blocked — and then discarded the `null` return and reported success.
 *
 * The fourth defect of this shape here: a badge counting nothing, a retry
 * reporting SUCCEEDED while skipping a step, a preference stored and never
 * applied, a theme repainting nothing. In each, a claim was asserted where an
 * observation was available.
 */
describe("openExternal", () => {
  it("opens a tab, never a popup", () => {
    /*
     * The load-bearing assertion. Any features string at all turns this into a
     * popup, and the string it passed was not even buying `noopener` — the
     * handle is severed directly instead, which is the same protection and
     * leaves a return value to check.
     */
    const handle = { opener: {} as unknown };
    const open = jest.fn().mockReturnValue(handle);

    openWith(open, "https://example.test/login", "The workspace");

    expect(open).toHaveBeenCalledWith("https://example.test/login", "_blank");
    expect(open.mock.calls[0]).toHaveLength(2);
    expect(handle.opener).toBeNull();
  });

  it("reports success only when a handle came back", () => {
    const result = openWith(
      jest.fn().mockReturnValue({ opener: {} }),
      "https://example.test/",
      "The workspace",
    );

    expect(result.opened).toBe(true);
    expect(result.message).toContain("opened in a new tab");
  });

  it("reports the block, and hands back the URL, when the browser refuses", () => {
    /*
     * The case that produced "the button does nothing". Naming it as a browser
     * decision and including the address means the operator can still get
     * there, which "nothing happened" never allowed.
     */
    const result = openWith(
      jest.fn().mockReturnValue(null),
      "https://example.test/login",
      "The workspace",
    );

    expect(result.opened).toBe(false);
    expect(result.message).toContain("blocked");
    expect(result.message).toContain("https://example.test/login");
  });

  it("refuses an empty URL rather than opening about:blank", () => {
    const open = jest.fn();

    const result = openWith(open, "", "The workspace");

    expect(result.opened).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("names the thing being opened, so one message serves every caller", () => {
    expect(
      openWith(
        jest.fn().mockReturnValue({ opener: {} }),
        "https://example.test/",
        "The invoice",
      ).message,
    ).toContain("The invoice");
  });
});
