import { serverSearchHref } from "./utils";

/**
 * BUG-3176. A server-mode table's search must reach the backend (the rows shown
 * are one page of many), and it must do so without navigating on first render or
 * on a value that is already in the URL.
 */
describe("serverSearchHref", () => {
  const params = (query: string) => new URLSearchParams(query);
  /** The query of a returned href as an object, so parameter order is not asserted. */
  const query = (href: string | null) => {
    expect(href).not.toBeNull();
    const [path, qs] = (href as string).split("?");
    return { path, params: Object.fromEntries(new URLSearchParams(qs)) };
  };

  it("puts the typed text in the URL and returns to page 1", () => {
    expect(
      query(serverSearchHref("/employees", params("page=4"), "alice")),
    ).toEqual({
      path: "/employees",
      params: { page: "1", search: "alice" },
    });
  });

  it("does nothing when the text is already what the URL says", () => {
    expect(
      serverSearchHref("/employees", params("search=alice&page=2"), "alice"),
    ).toBeNull();
  });

  it("does nothing on the initial render with an empty box and no search in the URL", () => {
    expect(serverSearchHref("/employees", params("page=3"), "")).toBeNull();
  });

  it("ignores surrounding whitespace", () => {
    expect(
      serverSearchHref("/employees", params("search=alice"), "  alice "),
    ).toBeNull();
  });

  it("removes the search when the box is cleared, and returns to page 1", () => {
    expect(
      query(
        serverSearchHref(
          "/employees",
          params("search=alice&page=5&sort=name"),
          "",
        ),
      ).params,
    ).toEqual({ page: "1", sort: "name" });
  });

  it("keeps every other query parameter (sort, filters)", () => {
    expect(
      query(
        serverSearchHref(
          "/employees",
          params("orderBy=name+asc&statusFilter=ACTIVE"),
          "bob",
        ),
      ).params,
    ).toEqual({
      orderBy: "name asc",
      statusFilter: "ACTIVE",
      search: "bob",
      page: "1",
    });
  });

  it("encodes characters that would otherwise break the URL", () => {
    const href = serverSearchHref("/employees", params(""), "a&b=c");
    expect(href).not.toContain("a&b=c");
    expect(query(href).params.search).toBe("a&b=c");
  });
});
