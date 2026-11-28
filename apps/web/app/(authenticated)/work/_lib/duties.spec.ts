import {
  buildGenerateBody,
  buildHandoverPayload,
  buildOccurrencesQuery,
  buildTemplatePayload,
  buildTemplateSearchQuery,
  buildTemplatesQuery,
  buildHandoversQuery,
  checklistProgress,
  describeGenerate,
  describePage,
  draftFromTemplate,
  emptyTemplateDraft,
  formatWeekdays,
  isDateInput,
  isOccurrenceClosed,
  isValidTimezone,
  mergeTemplateOptions,
  minutesToTime,
  occurrenceTone,
  templateKeyFromName,
  timeToMinutes,
  timezoneOptions,
  toggleWeekday,
  todayInputValue,
  trimmedNote,
  type DutyCheck,
  type DutyTemplate,
  type TemplateDraft,
} from "./duties";

const valid = (patch: Partial<TemplateDraft> = {}): TemplateDraft => ({
  ...emptyTemplateDraft("Pacific/Auckland"),
  key: "opening-checks",
  name: "Opening checks",
  ...patch,
});

describe("duty times and weekdays", () => {
  it("round-trips minutes and HH:MM and rejects the out of range", () => {
    expect(minutesToTime(510)).toBe("08:30");
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(1439)).toBe("23:59");
    expect(minutesToTime(1440)).toBe("");
    expect(minutesToTime(null)).toBe("");
    expect(timeToMinutes("08:30")).toBe(510);
    expect(timeToMinutes("24:00")).toBeNull();
    expect(timeToMinutes("08:60")).toBeNull();
    expect(timeToMinutes("")).toBeNull();
  });

  it("describes weekdays as a range, a list or every day", () => {
    expect(formatWeekdays([1, 2, 3, 4, 5])).toBe("Mon to Fri");
    expect(formatWeekdays([1, 3, 6])).toBe("Mon, Wed, Sat");
    expect(formatWeekdays([1, 2, 3, 4, 5, 6, 7])).toBe("Every day");
    expect(formatWeekdays([6, 7])).toBe("Sat, Sun");
    expect(formatWeekdays([])).toBe("No days");
  });

  it("toggles a weekday and keeps the set sorted", () => {
    expect(toggleWeekday([1, 3], 2)).toEqual([1, 2, 3]);
    expect(toggleWeekday([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("knows a real zone from a made-up one, and keeps the zone in use", () => {
    expect(isValidTimezone("Pacific/Auckland")).toBe(true);
    expect(isValidTimezone("America/Los_Angeles")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    const values = timezoneOptions("Asia/Kolkata").map((o) => o.value);
    expect(values[0]).toBe("Asia/Kolkata");
    expect(values).toContain("Pacific/Auckland");
    expect(timezoneOptions("UTC").filter((o) => o.value === "UTC")).toHaveLength(
      1,
    );
  });
});

describe("duty list queries", () => {
  it("sends the server paging parameters and each filter", () => {
    expect(
      buildOccurrencesQuery({ date: "2027-03-01", templateId: "t1", skip: 20 }),
    ).toBe("take=10&skip=20&date=2027-03-01&templateId=t1");
    expect(buildOccurrencesQuery({})).toBe("take=10&skip=0");
    expect(buildTemplatesQuery({ active: true, skip: 10 })).toBe(
      "take=10&skip=10&active=true",
    );
    expect(buildTemplatesQuery({ active: false })).toBe(
      "take=10&skip=0&active=false",
    );
    expect(buildTemplatesQuery({ active: null })).toBe("take=10&skip=0");
    expect(buildTemplateSearchQuery("")).toBe("take=20&skip=0");
    expect(buildTemplateSearchQuery("  open ")).toBe("take=20&skip=0&search=open");
    expect(buildHandoversQuery({ status: "ACKNOWLEDGED" })).toBe(
      "take=10&skip=0&status=ACKNOWLEDGED",
    );
  });

  it("describes a page by the server total and offers neighbours only where they exist", () => {
    expect(describePage(0, 10, 25)).toEqual({
      label: "1 to 10 of 25",
      hasPrev: false,
      hasNext: true,
    });
    expect(describePage(20, 5, 25)).toEqual({
      label: "21 to 25 of 25",
      hasPrev: true,
      hasNext: false,
    });
    expect(describePage(10, 10, 20).hasNext).toBe(false);
    expect(describePage(0, 0, 0)).toEqual({
      label: "0 of 0",
      hasPrev: false,
      hasNext: false,
    });
  });

  it("formats today from local parts, and validates a date input", () => {
    expect(todayInputValue(new Date(2027, 2, 1, 23, 30))).toBe("2027-03-01");
    expect(isDateInput("2027-02-30")).toBe(false);
    expect(isDateInput("2027-02-28")).toBe(true);
    expect(isDateInput("")).toBe(false);
  });
});

describe("checklist and occurrence state", () => {
  const check = (patch: Partial<DutyCheck>): DutyCheck => ({
    id: "c",
    position: 0,
    label: "Check",
    required: false,
    completedAt: null,
    completedById: null,
    note: null,
    ...patch,
  });

  it("counts done and required-open checks", () => {
    expect(
      checklistProgress([
        check({ required: true, completedAt: "2027-03-01T00:00:00Z" }),
        check({ required: true }),
        check({}),
      ]),
    ).toEqual({ done: 1, total: 3, requiredOpen: 1 });
    expect(checklistProgress([])).toEqual({ done: 0, total: 0, requiredOpen: 0 });
  });

  it("treats done, cancelled and archived occurrences as closed", () => {
    expect(isOccurrenceClosed({ status: "DONE", archivedAt: null })).toBe(true);
    expect(isOccurrenceClosed({ status: "CANCELLED", archivedAt: null })).toBe(
      true,
    );
    expect(isOccurrenceClosed({ status: "OPEN", archivedAt: "x" })).toBe(true);
    expect(isOccurrenceClosed({ status: "IN_PROGRESS", archivedAt: null })).toBe(
      false,
    );
    expect(occurrenceTone("DONE")).toBe("good");
    expect(occurrenceTone("BLOCKED")).toBe("danger");
    expect(occurrenceTone(null)).toBe("neutral");
  });

  it("summarises a generate run", () => {
    expect(
      describeGenerate({
        created: [1, 2],
        existing: [1],
        skipped: [{ templateId: "t", key: "k", reason: "NOT_ON_THIS_WEEKDAY" }],
      }),
    ).toBe("Created 2, already existing 1, skipped 1");
    expect(describeGenerate({ created: [], existing: [], skipped: [] })).toBe(
      "Created 0, already existing 0",
    );
  });
});

describe("buildTemplatePayload", () => {
  it("builds a create body: key sent, blanks left out, weekdays sorted", () => {
    const built = buildTemplatePayload(
      valid({
        weekdays: [5, 1, 3],
        startTime: "08:00",
        dueTime: "09:30",
        checklist: [
          { label: "  Unlock doors ", required: true },
          { label: "Lights", required: false },
        ],
      }),
      "create",
    );
    expect(built).toEqual({
      ok: true,
      body: {
        key: "opening-checks",
        name: "Opening checks",
        weekdays: [1, 3, 5],
        timezone: "Pacific/Auckland",
        startMinutes: 480,
        dueMinutes: 570,
        checklist: [
          { label: "Unlock doors", required: true },
          { label: "Lights", required: false },
        ],
      },
    });
  });

  it("builds an update body: no key, cleared optionals are null", () => {
    const built = buildTemplatePayload(valid(), "update");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.body).not.toHaveProperty("key");
    expect(built.body).toMatchObject({
      description: null,
      startMinutes: null,
      dueMinutes: null,
      assigneeEmployeeId: null,
      teamId: null,
    });
  });

  it("refuses what the API would refuse, with a message", () => {
    const message = (draft: TemplateDraft, mode: "create" | "update" = "create") => {
      const built = buildTemplatePayload(draft, mode);
      return built.ok ? null : built.message;
    };
    expect(message(valid({ name: "  " }))).toBe("Enter a name.");
    expect(message(valid({ key: "Bad Key" }))).toMatch(/Key must be/);
    expect(message(valid({ key: "Bad Key" }), "update")).toBeNull();
    expect(message(valid({ weekdays: [] }))).toBe("Choose at least one weekday.");
    expect(message(valid({ timezone: "Not/AZone" }))).toBe("Choose a timezone.");
    expect(message(valid({ startTime: "10:00", dueTime: "09:00" }))).toBe(
      "Due time must be after the start time.",
    );
    expect(message(valid({ checklist: [{ label: " ", required: true }] }))).toBe(
      "Every checklist item needs a label.",
    );
    expect(message(valid({ assigneeEmployeeId: "e1", teamId: "t1" }))).toBeNull();
    expect(
      message(
        valid({
          checklist: Array.from({ length: 51 }, (_, i) => ({
            label: `item ${i}`,
            required: false,
          })),
        }),
      ),
    ).toBe("A checklist holds at most 50 items.");
  });

  it("suggests a key from a name that the key pattern accepts", () => {
    expect(templateKeyFromName("Opening Checks!")).toBe("opening-checks");
    expect(templateKeyFromName("  --  ")).toBe("");
    const draft = valid({ key: templateKeyFromName("Closing / Cash-up") });
    expect(draft.key).toBe("closing-cash-up");
    expect(buildTemplatePayload(draft, "create").ok).toBe(true);
  });

  it("reads a template back into a draft", () => {
    const template: DutyTemplate = {
      id: "t",
      key: "k1",
      name: "N",
      description: null,
      weekdays: [3, 1],
      timezone: "UTC",
      startMinutes: 60,
      dueMinutes: null,
      assigneeEmployeeId: "e1",
      teamId: null,
      isActive: true,
      checklist: [{ id: "i", position: 0, label: "A", required: true }],
    };
    expect(draftFromTemplate(template)).toMatchObject({
      key: "k1",
      weekdays: [1, 3],
      startTime: "01:00",
      dueTime: "",
      assigneeEmployeeId: "e1",
      checklist: [{ label: "A", required: true }],
    });
  });
});

describe("handover and generate bodies", () => {
  it("addresses exactly one person or one team", () => {
    expect(
      buildHandoverPayload({
        target: "person",
        toEmployeeId: "e1",
        teamId: "stale",
        note: " Keys are in the safe ",
        occurrenceId: "o1",
      }),
    ).toEqual({
      ok: true,
      body: { toEmployeeId: "e1", note: "Keys are in the safe", occurrenceId: "o1" },
    });
    expect(
      buildHandoverPayload({
        target: "team",
        toEmployeeId: "stale",
        teamId: "t1",
        note: "abc",
      }),
    ).toEqual({ ok: true, body: { teamId: "t1", note: "abc" } });
  });

  it("refuses a missing receiver and a short note", () => {
    expect(
      buildHandoverPayload({
        target: "person",
        toEmployeeId: "",
        teamId: "",
        note: "long enough",
      }),
    ).toEqual({ ok: false, message: "Choose who receives the handover." });
    expect(
      buildHandoverPayload({
        target: "team",
        toEmployeeId: "",
        teamId: "",
        note: "long enough",
      }),
    ).toEqual({ ok: false, message: "Choose the team that receives it." });
    expect(
      buildHandoverPayload({
        target: "team",
        toEmployeeId: "",
        teamId: "t",
        note: "ab",
      }),
    ).toEqual({ ok: false, message: "Write a note of at least 3 characters." });
  });

  it("builds the generate body only for a real date", () => {
    expect(buildGenerateBody("2027-03-01")).toEqual({
      ok: true,
      body: { date: "2027-03-01" },
    });
    expect(buildGenerateBody("2027-13-01").ok).toBe(false);
  });

  it("sends a check note only when there is one, within the API limit", () => {
    expect(trimmedNote("  ")).toEqual({});
    expect(trimmedNote(" ok ")).toEqual({ note: "ok" });
    expect(trimmedNote("x".repeat(600)).note).toHaveLength(500);
  });
});

describe("template filter options", () => {
  it("keeps the chosen template in the options even when the search no longer returns it", () => {
    const found = [{ id: "b", name: "Beta", key: "beta" }];
    expect(mergeTemplateOptions(found, { id: "a", name: "Alpha", key: "alpha" })).toEqual([
      { id: "a", name: "Alpha", key: "alpha" },
      { id: "b", name: "Beta", key: "beta" },
    ]);
    expect(mergeTemplateOptions(found, { id: "b", name: "Beta" })).toEqual([
      { id: "b", name: "Beta", key: "beta" },
    ]);
    expect(mergeTemplateOptions([], null)).toEqual([]);
  });
});
