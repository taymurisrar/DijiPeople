import { describePage } from "./list-paging";

describe("client-side paging window", () => {
  it("describes the first page of a long list", () => {
    const window = describePage(154, 1, 25);
    expect(window).toMatchObject({
      page: 1,
      pageCount: 7,
      start: 0,
      end: 25,
      firstShown: 1,
      lastShown: 25,
    });
  });

  it("stops the last page at the end of the list", () => {
    // 154 rows, 25 a page: the seventh page holds four, not twenty-five.
    const window = describePage(154, 7, 25);
    expect(window).toMatchObject({ start: 150, end: 154, lastShown: 154 });
  });

  it("clamps a page number that has outlived its list", () => {
    /*
     * The defect this guards. Filtering the tenant timeline to a category with
     * two entries while sitting on page four rendered an empty panel above a
     * pager that said "Page 4 of 1" — a list that plainly had rows in it and
     * showed none of them.
     */
    expect(describePage(2, 4, 25)).toMatchObject({
      page: 1,
      pageCount: 1,
      start: 0,
      end: 2,
    });
  });

  it("stays on a valid page when the list is empty", () => {
    expect(describePage(0, 3, 25)).toMatchObject({
      page: 1,
      pageCount: 1,
      start: 0,
      end: 0,
      firstShown: 0,
      lastShown: 0,
    });
  });

  it("treats a nonsense page request as the first page", () => {
    expect(describePage(50, 0, 25).page).toBe(1);
    expect(describePage(50, -3, 25).page).toBe(1);
    expect(describePage(50, Number.NaN, 25).page).toBe(1);
  });

  it("never divides by a page size of zero", () => {
    // A pageCount of Infinity renders a pager with no last page.
    expect(describePage(10, 1, 0)).toMatchObject({ pageCount: 10, end: 1 });
  });

  it("covers every row exactly once across all its pages", () => {
    const total = 154;
    const seen: number[] = [];
    const { pageCount } = describePage(total, 1, 25);
    for (let page = 1; page <= pageCount; page += 1) {
      const window = describePage(total, page, 25);
      for (let index = window.start; index < window.end; index += 1)
        seen.push(index);
    }
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });
});
