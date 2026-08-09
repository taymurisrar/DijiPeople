import {
  approvalRuntimeSpec,
  attendanceRuntimeSpec,
  customerRuntimeSpec,
  jobOpeningRuntimeSpec,
  leaveRuntimeSpec,
  onboardingRuntimeSpec,
  projectRuntimeSpec,
  recruitmentApplicationRuntimeSpec,
  recruitmentCandidateRuntimeSpec,
  recruitmentTalentPoolRuntimeSpec,
  timesheetRuntimeSpec,
} from "./standard-module-specs";

/*
 * Validates every saved view against the fields its module declares.
 *
 * A view that names a field the module does not have fails silently and in the
 * worst possible way: the column renders blank, or the filter matches nothing
 * and the grid says "No records match the selected search or filters" — which
 * reads as "there is no data" rather than "this view is broken". Nothing in the
 * type system catches it, because columns and filters are plain strings.
 *
 * Covers every standard module, not only the ones reported, since the same
 * mistake is equally invisible everywhere.
 */

type AnySpec = {
  moduleKey: string;
  fields?: ReadonlyArray<{ logicalName: string }>;
  views?: ReadonlyArray<{
    logicalName: string;
    viewId?: string;
    displayName?: string;
    columns?: readonly string[];
    filters?: ReadonlyArray<{ fieldLogicalName?: string; operator?: string }>;
    defaultSort?: ReadonlyArray<{ fieldLogicalName?: string }>;
  }>;
  primaryNameField?: string;
  ownerField?: string;
  statusField?: string;
};

const SPECS: AnySpec[] = [
  attendanceRuntimeSpec,
  leaveRuntimeSpec,
  approvalRuntimeSpec,
  customerRuntimeSpec,
  projectRuntimeSpec,
  timesheetRuntimeSpec,
  onboardingRuntimeSpec,
  jobOpeningRuntimeSpec,
  recruitmentApplicationRuntimeSpec,
  recruitmentCandidateRuntimeSpec,
  recruitmentTalentPoolRuntimeSpec,
];

function fieldNames(spec: AnySpec): Set<string> {
  return new Set((spec.fields ?? []).map((field) => field.logicalName));
}

describe.each(SPECS.map((spec) => [spec.moduleKey, spec] as const))(
  "%s views",
  (_moduleKey, spec) => {
    const known = fieldNames(spec);
    const views = spec.views ?? [];

    it("declares at least one view, or the module opens with no grid", () => {
      expect(views.length).toBeGreaterThan(0);
    });

    it("gives every view an id, a name and a label", () => {
      for (const view of views) {
        expect(view.logicalName?.trim()).toBeTruthy();
        expect(view.viewId?.trim()).toBeTruthy();
        expect(view.displayName?.trim()).toBeTruthy();
      }
    });

    it("shows at least one column in every view", () => {
      for (const view of views) {
        expect(view.columns?.length ?? 0).toBeGreaterThan(0);
      }
    });

    it("only shows columns the module actually declares", () => {
      const unknown: string[] = [];
      for (const view of views) {
        for (const column of view.columns ?? []) {
          if (!known.has(column)) unknown.push(`${view.logicalName}.${column}`);
        }
      }
      /* Listed rather than counted, so a failure names the offender. */
      expect(unknown).toEqual([]);
    });

    it("only filters on fields the module declares", () => {
      const unknown: string[] = [];
      for (const view of views) {
        for (const filter of view.filters ?? []) {
          const field = filter.fieldLogicalName;
          if (field && !known.has(field)) {
            unknown.push(`${view.logicalName}.${field}`);
          }
        }
      }
      expect(unknown).toEqual([]);
    });

    it("only uses filter operators the runtime implements", () => {
      /*
       * `applyRuntimeViewFilters` handles eq, neq and in, and returns true for
       * anything else — so a misspelled operator does not error, it silently
       * lets every record through and the view shows unfiltered data. Seven
       * views shipped with "equals", which is not implemented.
       */
      const SUPPORTED = ["eq", "neq", "in"];
      const unsupported: string[] = [];

      for (const view of views) {
        for (const filter of view.filters ?? []) {
          if (filter.operator && !SUPPORTED.includes(filter.operator)) {
            unsupported.push(`${view.logicalName}: ${filter.operator}`);
          }
        }
      }

      expect(unsupported).toEqual([]);
    });

    it("only sorts on fields the module declares", () => {
      const unknown: string[] = [];
      for (const view of views) {
        for (const sort of view.defaultSort ?? []) {
          const field = sort.fieldLogicalName;
          if (field && !known.has(field)) {
            unknown.push(`${view.logicalName}.${field}`);
          }
        }
      }
      expect(unknown).toEqual([]);
    });

    it("keeps view logical names unique within the module", () => {
      const names = views.map((view) => view.logicalName);
      expect(new Set(names).size).toBe(names.length);
    });

    it("names a primary field that exists, since it titles every record", () => {
      if (!spec.primaryNameField) return;
      expect(known.has(spec.primaryNameField)).toBe(true);
    });

    it("names owner and status fields that exist when it declares them", () => {
      for (const field of [spec.ownerField, spec.statusField]) {
        if (field) expect(known.has(field)).toBe(true);
      }
    });
  },
);

describe("view identifiers", () => {
  it("are unique across every module, since the grid resolves a view by id alone", () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];

    for (const spec of SPECS) {
      for (const view of spec.views ?? []) {
        if (!view.viewId) continue;
        const owner = seen.get(view.viewId);
        if (owner) {
          collisions.push(`${view.viewId}: ${owner} and ${spec.moduleKey}`);
        } else {
          seen.set(view.viewId, spec.moduleKey);
        }
      }
    }

    expect(collisions).toEqual([]);
  });
});
