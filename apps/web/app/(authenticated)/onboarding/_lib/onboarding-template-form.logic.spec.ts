import {
  buildOnboardingTemplatePayload,
  buildTaskBlueprintsPayload,
  createTaskBlueprintRow,
  moveTaskBlueprintRow,
  removeTaskBlueprintRow,
  taskBlueprintRowsFromTemplate,
  validateTemplateForm,
  type TaskBlueprintRow,
} from "./onboarding-template-form.logic";

describe("taskBlueprintRowsFromTemplate", () => {
  it("gives a create form one empty row when there is no template yet", () => {
    const rows = taskBlueprintRowsFromTemplate(undefined);
    expect(rows).toEqual([
      {
        key: "0",
        title: "",
        description: "",
        dueOffsetDays: null,
        assignedUserId: "",
      },
    ]);
  });

  it("gives a create form one empty row when the template has none", () => {
    const rows = taskBlueprintRowsFromTemplate({ taskBlueprints: [] });
    expect(rows).toHaveLength(1);
  });

  it("maps an existing template's blueprints in their saved order", () => {
    const rows = taskBlueprintRowsFromTemplate({
      taskBlueprints: [
        { title: "Collect documents", dueOffsetDays: 0 },
        {
          title: "Assign equipment",
          description: "Laptop and badge",
          dueOffsetDays: 3,
          assignedUserId: "user-1",
        },
      ],
    });

    expect(rows).toEqual([
      {
        key: "0",
        title: "Collect documents",
        description: "",
        dueOffsetDays: 0,
        assignedUserId: "",
      },
      {
        key: "1",
        title: "Assign equipment",
        description: "Laptop and badge",
        dueOffsetDays: 3,
        assignedUserId: "user-1",
      },
    ]);
  });
});

describe("moveTaskBlueprintRow", () => {
  const rows: TaskBlueprintRow[] = [
    createTaskBlueprintRow("a"),
    createTaskBlueprintRow("b"),
    createTaskBlueprintRow("c"),
  ];
  rows[0].title = "First";
  rows[1].title = "Second";
  rows[2].title = "Third";

  it("swaps a row with the one above it", () => {
    const next = moveTaskBlueprintRow(rows, 1, "up");
    expect(next.map((row) => row.title)).toEqual(["Second", "First", "Third"]);
  });

  it("swaps a row with the one below it", () => {
    const next = moveTaskBlueprintRow(rows, 1, "down");
    expect(next.map((row) => row.title)).toEqual(["First", "Third", "Second"]);
  });

  it("does nothing when the first row is asked to move up", () => {
    const next = moveTaskBlueprintRow(rows, 0, "up");
    expect(next.map((row) => row.title)).toEqual(["First", "Second", "Third"]);
  });

  it("does nothing when the last row is asked to move down", () => {
    const next = moveTaskBlueprintRow(rows, 2, "down");
    expect(next.map((row) => row.title)).toEqual(["First", "Second", "Third"]);
  });
});

describe("removeTaskBlueprintRow", () => {
  it("removes the row at the given index", () => {
    const rows = [createTaskBlueprintRow("a"), createTaskBlueprintRow("b")];
    const next = removeTaskBlueprintRow(rows, 0);
    expect(next).toEqual([rows[1]]);
  });

  it("refuses to remove the last remaining row", () => {
    const rows = [createTaskBlueprintRow("a")];
    const next = removeTaskBlueprintRow(rows, 0);
    expect(next).toEqual(rows);
  });
});

describe("validateTemplateForm", () => {
  const validRow: TaskBlueprintRow = {
    ...createTaskBlueprintRow("a"),
    title: "Collect documents",
  };

  it("requires a template name", () => {
    expect(validateTemplateForm({ name: "  ", rows: [validRow] })).toBe(
      "Template name is required.",
    );
  });

  it("requires at least one row", () => {
    expect(validateTemplateForm({ name: "Standard", rows: [] })).toBe(
      "Add at least one task.",
    );
  });

  it("names the first row missing a title", () => {
    const rows = [validRow, { ...createTaskBlueprintRow("b"), title: "  " }];
    expect(validateTemplateForm({ name: "Standard", rows })).toBe(
      "Row 2: task title is required.",
    );
  });

  it("passes a fully filled-in form", () => {
    expect(
      validateTemplateForm({ name: "Standard", rows: [validRow] }),
    ).toBeNull();
  });
});

describe("buildTaskBlueprintsPayload", () => {
  it("trims text and drops empty optional fields", () => {
    const rows: TaskBlueprintRow[] = [
      {
        key: "a",
        title: "  Collect documents  ",
        description: "  ",
        dueOffsetDays: null,
        assignedUserId: "",
      },
      {
        key: "b",
        title: "Assign equipment",
        description: " Laptop and badge ",
        dueOffsetDays: 3,
        assignedUserId: "user-1",
      },
    ];

    expect(buildTaskBlueprintsPayload(rows)).toEqual([
      { title: "Collect documents" },
      {
        title: "Assign equipment",
        description: "Laptop and badge",
        dueOffsetDays: 3,
        assignedUserId: "user-1",
      },
    ]);
  });

  it("keeps a zero due-offset — it is a valid day count, not an absence", () => {
    const rows: TaskBlueprintRow[] = [
      {
        key: "a",
        title: "Day one task",
        description: "",
        dueOffsetDays: 0,
        assignedUserId: "",
      },
    ];
    expect(buildTaskBlueprintsPayload(rows)[0].dueOffsetDays).toBe(0);
  });
});

describe("buildOnboardingTemplatePayload", () => {
  it("builds the full save body, matching the DTO's whitelisted fields", () => {
    const payload = buildOnboardingTemplatePayload({
      name: "  Standard onboarding  ",
      description: "  ",
      isDefault: true,
      isActive: true,
      rows: [{ ...createTaskBlueprintRow("a"), title: "Collect documents" }],
      customFields: { region: "APAC" },
    });

    expect(payload).toEqual({
      name: "Standard onboarding",
      taskBlueprints: [{ title: "Collect documents" }],
      isDefault: true,
      isActive: true,
      customFields: { region: "APAC" },
    });
  });

  it("includes a trimmed description when one was entered", () => {
    const payload = buildOnboardingTemplatePayload({
      name: "Standard",
      description: "  Default checklist  ",
      isDefault: false,
      isActive: true,
      rows: [{ ...createTaskBlueprintRow("a"), title: "Collect documents" }],
      customFields: {},
    });

    expect(payload.description).toBe("Default checklist");
  });
});
