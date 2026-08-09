import { isVisibleByRules, resolveVisibleByRules } from "./visibility.resolver";
import type { VisibilityRule } from "./visibility.resolver";

/*
 * The visibility engine decides who sees a tab, a form section, a navigation
 * entry and an action button. Its failure modes are asymmetric: hiding
 * something from everyone is a visible annoyance, while showing something to
 * everyone is a disclosure. These pin the direction it fails in.
 */

const HR = {
  roleKeys: ["hr"],
  permissionKeys: ["employees.read"],
  departmentIds: ["dept-people"],
};

const EMPLOYEE = {
  roleKeys: ["employee"],
  permissionKeys: [],
  departmentIds: ["dept-eng"],
};

function visible(rules: VisibilityRule[], principal: typeof HR) {
  return isVisibleByRules({ visibilityRules: rules }, { principal });
}

describe("isVisibleByRules", () => {
  it("shows an item that carries no rules", () => {
    expect(visible([], EMPLOYEE)).toBe(true);
    expect(isVisibleByRules({}, { principal: EMPLOYEE })).toBe(true);
  });

  it("matches a role the viewer holds and hides it from one who does not", () => {
    const rules: VisibilityRule[] = [
      { operator: "has-any-role", roleKeys: ["hr", "global-admin"] },
    ];

    expect(visible(rules, HR)).toBe(true);
    expect(visible(rules, EMPLOYEE)).toBe(false);
  });

  it("inverts correctly for a not-has-role rule", () => {
    const rules: VisibilityRule[] = [
      { operator: "not-has-role", roleKeys: ["employee"] },
    ];

    expect(visible(rules, HR)).toBe(true);
    expect(visible(rules, EMPLOYEE)).toBe(false);
  });

  it("requires every rule to pass, not merely one", () => {
    const rules: VisibilityRule[] = [
      { operator: "has-any-role", roleKeys: ["hr"] },
      { operator: "in-department", departmentIds: ["dept-eng"] },
    ];

    /* HR holds the role but sits in the wrong department. */
    expect(visible(rules, HR)).toBe(false);
  });

  it("hides rather than shows when a role rule names nobody", () => {
    /* An empty list must not read as "no restriction". */
    expect(visible([{ operator: "has-any-role", roleKeys: [] }], HR)).toBe(
      false,
    );
  });

  it("hides when placement is unknown, rather than assuming a match", () => {
    /*
     * This is the case that produced a real defect: placement never reached
     * the principal, so department rules matched nobody. Failing closed is
     * correct — but it must be a deliberate false, not an accident.
     */
    const rules: VisibilityRule[] = [
      { operator: "in-department", departmentIds: ["dept-people"] },
    ];

    expect(
      isVisibleByRules(
        { visibilityRules: rules },
        { principal: { roleKeys: ["hr"], permissionKeys: [] } },
      ),
    ).toBe(false);
  });

  it("hides on an operator it does not recognise", () => {
    const rules = [
      { operator: "not-a-real-operator" },
    ] as unknown as VisibilityRule[];
    expect(visible(rules, HR)).toBe(false);
  });

  it("matches a department the viewer belongs to", () => {
    const rules: VisibilityRule[] = [
      { operator: "in-department", departmentIds: ["dept-people", "dept-ops"] },
    ];

    expect(visible(rules, HR)).toBe(true);
    expect(visible(rules, EMPLOYEE)).toBe(false);
  });

  it("is case insensitive about role keys", () => {
    const rules: VisibilityRule[] = [
      { operator: "has-any-role", roleKeys: ["HR"] },
    ];
    expect(visible(rules, HR)).toBe(true);
  });
});

describe("resolveVisibleByRules", () => {
  it("keeps only the items the principal may see", () => {
    const items = [
      { id: "open" },
      {
        id: "hr-only",
        visibilityRules: [
          { operator: "has-any-role" as const, roleKeys: ["hr"] },
        ],
      },
    ];

    expect(
      resolveVisibleByRules(items, { principal: EMPLOYEE }).map((i) => i.id),
    ).toEqual(["open"]);
    expect(
      resolveVisibleByRules(items, { principal: HR }).map((i) => i.id),
    ).toEqual(["open", "hr-only"]);
  });
});
