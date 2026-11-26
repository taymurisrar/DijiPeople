import { readFileSync } from "node:fs";
import path from "node:path";
import {
  WORK_COMPONENT_LABELS,
  WORK_COMPONENT_TYPES,
  buildWorkComponentsPayload,
  describeWorkComponentKey,
  isWorkComponentType,
  retainedWorkComponentsMessage,
  selectionId,
  toggleSelection,
  workComponentTypeLabel,
} from "./work-components";

const CUSTOMIZATION = path.resolve(
  __dirname,
  "../../../../../../../services/api/src/modules/customization",
);

function apiSource(file: string): string {
  return readFileSync(path.join(CUSTOMIZATION, file), "utf8").replace(/\r\n/g, "\n");
}

describe("client constants stay in step with the API", () => {
  it("has the API's work component types", () => {
    const source = apiSource("package-artifact.ts");
    const block = /export const WORK_COMPONENT_TYPES = \[([\s\S]*?)\] as const;/.exec(
      source,
    );
    expect(block).not.toBeNull();
    const parsed = [...(block as RegExpExecArray)[1].matchAll(/'(\w+)'/g)].map(
      (m) => m[1],
    );
    expect(parsed.length).toBeGreaterThan(0);
    expect([...WORK_COMPONENT_TYPES]).toEqual(parsed);
  });

  it("accepts the types the add endpoint's DTO accepts", () => {
    const source = apiSource("dto/package-alm.dto.ts");
    const match = /class WorkComponentRefDto \{\s*@IsIn\(\[([^\]]*)\]\)/.exec(source);
    expect(match).not.toBeNull();
    const parsed = [...(match as RegExpExecArray)[1].matchAll(/'(\w+)'/g)].map(
      (m) => m[1],
    );
    expect(parsed.length).toBeGreaterThan(0);
    expect([...WORK_COMPONENT_TYPES]).toEqual(parsed);
  });

  it("uses the API's key pattern", () => {
    const source = apiSource("dto/package-alm.dto.ts");
    const match = /class WorkComponentRefDto[\s\S]*?@Matches\((\/[^\n]+\/)\)/.exec(source);
    expect(match).not.toBeNull();
    // The client accepts exactly what the API pattern accepts.
    const apiPattern = new RegExp(
      (match as RegExpExecArray)[1].slice(1, (match as RegExpExecArray)[1].lastIndexOf("/")),
    );
    for (const key of ["kitchen-prep", "a1", "ab.cd_ef-9", "Bad", "x", "-lead", "has space"]) {
      const built = buildWorkComponentsPayload([{ type: "workUnit", key }]);
      expect(built.ok).toBe(apiPattern.test(key));
    }
  });
});

describe("labels", () => {
  it("names each work type for people", () => {
    expect(workComponentTypeLabel("workUnit")).toBe("Work unit");
    expect(workComponentTypeLabel("workProfile")).toBe("Work profile");
    expect(workComponentTypeLabel("workQueue")).toBe("Work queue");
    expect(workComponentTypeLabel("form")).toBeNull();
    for (const type of WORK_COMPONENT_TYPES) {
      expect(WORK_COMPONENT_LABELS[type]).toBeTruthy();
      expect(isWorkComponentType(type)).toBe(true);
    }
    expect(isWorkComponentType("form")).toBe(false);
  });

  it("describes the API's type:key form", () => {
    expect(describeWorkComponentKey("workQueue:front-desk")).toBe("Work queue front-desk");
    expect(describeWorkComponentKey("mystery")).toBe("mystery");
  });
});

describe("the add body", () => {
  it("builds the components list the API accepts", () => {
    expect(
      buildWorkComponentsPayload([
        { type: "workUnit", key: "unit-one" },
        { type: "workProfile", key: "profile.one" },
        { type: "workQueue", key: "queue_1" },
      ]),
    ).toEqual({
      ok: true,
      body: {
        components: [
          { type: "workUnit", key: "unit-one" },
          { type: "workProfile", key: "profile.one" },
          { type: "workQueue", key: "queue_1" },
        ],
      },
    });
  });

  it("refuses an empty selection and more than the API allows", () => {
    expect(buildWorkComponentsPayload([])).toMatchObject({ ok: false });
    const many = Array.from({ length: 201 }, (_, i) => ({
      type: "workUnit" as const,
      key: `unit-${i}`,
    }));
    expect(buildWorkComponentsPayload(many)).toMatchObject({ ok: false });
  });

  it("toggles a selection on and off", () => {
    const ref = { type: "workUnit" as const, key: "unit-one" };
    const on = toggleSelection([], ref);
    expect(on.map(selectionId)).toEqual(["workUnit:unit-one"]);
    expect(toggleSelection(on, ref)).toEqual([]);
    expect(
      toggleSelection(on, { type: "workQueue", key: "unit-one" }).map(selectionId),
    ).toEqual(["workUnit:unit-one", "workQueue:unit-one"]);
  });
});

describe("the uninstall result", () => {
  it("says retained work components were kept, deactivated, with history preserved", () => {
    const message = retainedWorkComponentsMessage([
      "workUnit:kitchen-prep",
      "workQueue:front-desk",
    ]);
    expect(message).toContain("kept (deactivated), history preserved");
    expect(message).toContain("Work unit kitchen-prep");
    expect(message).toContain("Work queue front-desk");
  });

  it("says nothing when none were retained", () => {
    expect(retainedWorkComponentsMessage([])).toBeNull();
    expect(retainedWorkComponentsMessage(undefined)).toBeNull();
  });

  it("is a key the API really returns on uninstall", () => {
    expect(apiSource("package-alm.service.ts")).toContain("retainedWorkComponents");
  });
});
