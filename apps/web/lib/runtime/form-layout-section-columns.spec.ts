import { resolveSectionColumnClass } from "./form-layout-grid";

/*
 * ITEM-0184 (H10) — at 820px the employee record kept three section columns
 * about 200px wide each, because three columns began at `md` (768px).
 */
describe("record section columns", () => {
  it("does not put three sections side by side below xl", () => {
    const classes = resolveSectionColumnClass(3).split(" ");

    expect(classes).not.toContain("md:grid-cols-3");
    expect(classes).toContain("md:grid-cols-2");
    expect(classes).toContain("xl:grid-cols-3");
  });

  it("keeps two-column and single-column layouts as they were", () => {
    expect(resolveSectionColumnClass(2)).toBe("md:grid-cols-2");
    expect(resolveSectionColumnClass(1)).toBe("grid-cols-1");
  });
});
