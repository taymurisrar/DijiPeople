import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_MEASURES,
  CONTRIBUTION_WORK_KINDS,
  buildContributionsQuery,
  buildCorrectContributionPayload,
  buildCreateContributionPayload,
  buildReasonPayload,
  buildReviewPayload,
  buildSummaryQuery,
  totalOccurrences,
  describeAmount,
  emptyContributionForm,
  fieldsForMeasure,
  formFromEntry,
  needsRetrospectiveNote,
  newClientRequestId,
  validateContributionForm,
  validateReason,
  validateReview,
  verificationTone,
  weekRange,
  type ContributionEntry,
  type ContributionFormState,
} from "./contributions";

const NOW = new Date("2026-12-10T12:00:00.000Z");

function form(patch: Partial<ContributionFormState>): ContributionFormState {
  return { ...emptyContributionForm("web-req-12345678"), ...patch };
}

function apiList(name: string): string[] {
  const source = readFileSync(
    path.resolve(
      __dirname,
      "../../../../../../services/api/src/modules/contributions/dto/contribution.dto.ts",
    ),
    "utf8",
  ).replace(/\r/g, "");
  const block = new RegExp(
    `export const ${name} = \\[([\\s\\S]*?)\\] as const`,
  ).exec(source);
  expect(block).not.toBeNull();
  return [...(block as RegExpExecArray)[1].matchAll(/'([A-Z_]+)'/g)].map(
    (m) => m[1],
  );
}

describe("vocabulary mirrors the API", () => {
  it("work kinds, measures and categories match the DTO", () => {
    expect([...CONTRIBUTION_WORK_KINDS]).toEqual(
      apiList("CONTRIBUTION_WORK_KINDS"),
    );
    expect([...CONTRIBUTION_MEASURES]).toEqual(apiList("CONTRIBUTION_MEASURES"));
    expect([...CONTRIBUTION_CATEGORIES]).toEqual(
      apiList("CONTRIBUTION_CATEGORIES"),
    );
  });
});

describe("measure-dependent fields", () => {
  it("shows the fields each measure needs", () => {
    expect(fieldsForMeasure("INTERVAL")).toEqual(["interval"]);
    expect(fieldsForMeasure("QUANTITY")).toEqual(["occurredAt", "quantity"]);
    expect(fieldsForMeasure("OCCURRENCE")).toEqual(["occurredAt"]);
  });
});

describe("validateContributionForm", () => {
  it("requires an ordered interval", () => {
    expect(validateContributionForm(form({}), NOW)).not.toBeNull();
    expect(
      validateContributionForm(
        form({ startsAt: "2026-12-10T10:00", endsAt: "2026-12-10T09:00" }),
        NOW,
      ),
    ).toMatch(/after the start/);
    expect(
      validateContributionForm(
        form({ startsAt: "2026-12-10T09:00", endsAt: "2026-12-10T10:00" }),
        NOW,
      ),
    ).toBeNull();
  });

  it("requires a number and a unit for a quantity", () => {
    const base = {
      measure: "QUANTITY" as const,
      occurredAt: "2026-12-10T09:00",
    };
    expect(validateContributionForm(form({ ...base }), NOW)).toMatch(/quantity/);
    expect(
      validateContributionForm(form({ ...base, quantity: "12" }), NOW),
    ).toMatch(/unit/);
    expect(
      validateContributionForm(
        form({ ...base, quantity: "12.5", unitKey: "Pages" }),
        NOW,
      ),
    ).toMatch(/unit/);
    expect(
      validateContributionForm(
        form({ ...base, quantity: "12.5", unitKey: "pages" }),
        NOW,
      ),
    ).toBeNull();
  });

  it("needs only a time for an occurrence", () => {
    expect(
      validateContributionForm(form({ measure: "OCCURRENCE" }), NOW),
    ).not.toBeNull();
    expect(
      validateContributionForm(
        form({ measure: "OCCURRENCE", occurredAt: "2026-12-10T09:00" }),
        NOW,
      ),
    ).toBeNull();
  });

  it("asks for a note when the entry is older than seven days", () => {
    const old = form({
      measure: "OCCURRENCE",
      occurredAt: "2026-11-20T09:00",
    });
    expect(needsRetrospectiveNote(old, NOW)).toBe(true);
    expect(validateContributionForm(old, NOW)).toMatch(/note/);
    expect(
      validateContributionForm({ ...old, note: "Forgot to log it" }, NOW),
    ).toBeNull();
    expect(
      needsRetrospectiveNote(
        form({ measure: "OCCURRENCE", occurredAt: "2026-12-09T09:00" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("needs the capture time for an offline entry", () => {
    expect(
      validateContributionForm(
        form({
          measure: "OCCURRENCE",
          occurredAt: "2026-12-10T09:00",
          capturedOffline: true,
        }),
        NOW,
      ),
    ).toMatch(/captured/);
  });
});

describe("payloads", () => {
  it("never sends source, verification or state", () => {
    const body = buildCreateContributionPayload(
      form({
        measure: "QUANTITY",
        occurredAt: "2026-12-10T09:00",
        quantity: " 12 ",
        unitKey: "pages",
        note: " done ",
        category: "QUALITY",
      }),
      "Asia/Karachi",
    );
    expect(body).toMatchObject({
      workKind: "TASK",
      measure: "QUANTITY",
      quantity: "12",
      unitKey: "pages",
      category: "QUALITY",
      note: "done",
      timezone: "Asia/Karachi",
      clientRequestId: "web-req-12345678",
    });
    for (const forbidden of [
      "source",
      "verification",
      "state",
      "tenantId",
      "employeeId",
    ]) {
      expect(body).not.toHaveProperty(forbidden);
    }
    expect(body).not.toHaveProperty("startsAt");
    expect(body).not.toHaveProperty("capturedOffline");
  });

  it("sends the interval, and the offline capture time when set", () => {
    const body = buildCreateContributionPayload(
      form({
        startsAt: "2026-12-10T09:00",
        endsAt: "2026-12-10T10:00",
        capturedOffline: true,
        capturedAt: "2026-12-10T10:05",
      }),
      "UTC",
    );
    expect(body).toHaveProperty("startsAt");
    expect(body).toHaveProperty("endsAt");
    expect(body).not.toHaveProperty("occurredAt");
    expect(body).toMatchObject({ capturedOffline: true });
    expect(body).toHaveProperty("capturedAt");
  });

  it("a correction carries the reason and no work kind or measure", () => {
    const body = buildCorrectContributionPayload(
      form({ startsAt: "2026-12-10T09:00", endsAt: "2026-12-10T11:00" }),
      " wrong end time ",
      "UTC",
    );
    expect(body).toMatchObject({ reason: "wrong end time" });
    expect(body).not.toHaveProperty("workKind");
    expect(body).not.toHaveProperty("measure");
    expect(body).not.toHaveProperty("clientRequestId");
  });

  it("generates a bounded client request id the API accepts", () => {
    const id = newClientRequestId(() => "0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});

describe("reasons and reviews", () => {
  it("needs five characters", () => {
    expect(validateReason("abcd")).not.toBeNull();
    expect(validateReason(" abcde ")).toBeNull();
    expect(buildReasonPayload(" because ")).toEqual({ reason: "because" });
  });

  it("requires a note to reject or dispute, not to verify", () => {
    expect(validateReview("VERIFIED", "")).toBeNull();
    expect(validateReview("REJECTED", " ")).not.toBeNull();
    expect(validateReview("DISPUTED", "no evidence")).toBeNull();
    expect(buildReviewPayload("VERIFIED", "")).toEqual({ decision: "VERIFIED" });
    expect(buildReviewPayload("REJECTED", " no ")).toEqual({
      decision: "REJECTED",
      note: "no",
    });
  });

  it("reads verification as text-backed tones", () => {
    expect(verificationTone("VERIFIED")).toBe("good");
    expect(verificationTone("REJECTED")).toBe("danger");
    expect(verificationTone("UNVERIFIED")).toBe("muted");
  });
});

describe("amounts and ranges", () => {
  const base: ContributionEntry = {
    id: "e1",
    employeeId: "emp",
    workKind: "TASK",
    category: "PLANNED",
    measure: "INTERVAL",
    occurredAt: "2026-12-10T09:00:00.000Z",
    startsAt: "2026-12-10T09:00:00.000Z",
    endsAt: "2026-12-10T10:30:00.000Z",
    timezone: "UTC",
    quantity: null,
    unitKey: null,
    source: "SELF_REPORT",
    verification: "UNVERIFIED",
    reviewedAt: null,
    reviewNote: null,
    capturedOffline: false,
    retrospective: false,
    note: null,
    state: "ACTIVE",
    revision: 1,
    correctionReason: null,
    workItemId: null,
    createdAt: "2026-12-10T10:31:00.000Z",
  };

  it("keeps a quantity in its own unit", () => {
    expect(describeAmount(base)).toBe("1h 30m");
    expect(
      describeAmount({
        ...base,
        measure: "QUANTITY",
        quantity: "12.0000",
        unitKey: "pages",
      }),
    ).toBe("12.0000 pages");
    expect(describeAmount({ ...base, measure: "OCCURRENCE" })).toBe(
      "1 occurrence",
    );
  });

  it("pre-fills a correction from the entry", () => {
    const filled = formFromEntry(base, "web-x1234567");
    expect(filled.measure).toBe("INTERVAL");
    expect(filled.startsAt).toMatch(/^2026-12-10T\d{2}:\d{2}$/);
  });

  it("finds the Monday to Monday week", () => {
    const range = weekRange(new Date("2026-12-10T12:00:00.000Z"));
    expect(range.from).toBe("2026-12-07T00:00:00.000Z");
    expect(range.to).toBe("2026-12-14T00:00:00.000Z");
    expect(weekRange(new Date("2026-12-13T12:00:00.000Z")).from).toBe(
      "2026-12-07T00:00:00.000Z",
    );
  });

  it("builds queries", () => {
    expect(buildSummaryQuery({ from: "a", to: "b" })).toBe("from=a&to=b");
    expect(
      buildContributionsQuery({
        verification: "UNVERIFIED",
        includeHistory: true,
      }),
    ).toBe("verification=UNVERIFIED&includeHistory=true&take=100");
  });
});

describe("totalOccurrences", () => {
  /*
   * The API reports occurrences by verification and entries as a breakdown
   * (contribution-math.ts). The screen once typed both as bare numbers and drew
   * blank tiles; this pins the shape the API really returns.
   */
  const summary = {
    occurrences: { verified: 2, unverified: 3, disputed: 1 },
    entries: { counted: 9, rejectedExcluded: 1, offline: 0, retrospective: 2 },
  } as never;

  it("adds every verification state", () => {
    expect(totalOccurrences(summary)).toBe(6);
  });

  it("is zero when the API sent nothing", () => {
    expect(totalOccurrences({} as never)).toBe(0);
  });
});
