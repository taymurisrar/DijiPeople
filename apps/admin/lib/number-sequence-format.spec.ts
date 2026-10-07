import {
  draftFromSequence,
  formatSequenceNumber,
  numberSequencePatch,
  validateNumberSequenceDraft,
  type NumberSequence,
} from "./number-sequence-format";

/*
 * The examples are the API's own (services/api/src/common/numbering/
 * platform-numbering.service.spec.ts): the preview must show exactly the
 * number the server will issue.
 */
const PARTNER = { prefix: "PART-", separator: "", suffix: "", padding: 6 };

describe("formatSequenceNumber (admin preview)", () => {
  it("matches the API format", () => {
    expect(formatSequenceNumber(PARTNER, 1)).toBe("PART-000001");
    expect(
      formatSequenceNumber(
        { prefix: "PART", separator: "/", suffix: "-Q", padding: 4 },
        12,
      ),
    ).toBe("PART/0012-Q");
    expect(formatSequenceNumber(PARTNER, 1234567)).toBe("PART-1234567");
  });
});

const sequence: NumberSequence = {
  key: "partner",
  label: "Partner number",
  ...PARTNER,
  nextValue: 10,
  resetPolicy: "NEVER",
  updatedAt: "2026-10-07T00:00:00.000Z",
  updatedById: null,
  preview: "PART-000010",
};

describe("validateNumberSequenceDraft", () => {
  it("accepts the saved sequence unchanged", () => {
    expect(
      validateNumberSequenceDraft(draftFromSequence(sequence), 10),
    ).toEqual({});
  });

  it("refuses lowering the next number", () => {
    expect(
      validateNumberSequenceDraft(
        { ...draftFromSequence(sequence), nextValue: "9" },
        10,
      ),
    ).toEqual({ nextValue: "Can only increase (currently 10)." });
  });

  it("refuses lowercase, spaces and over-long parts, and padding out of range", () => {
    const errors = validateNumberSequenceDraft(
      {
        prefix: "part",
        separator: " ",
        suffix: "ABCDEFGHIJKLM",
        padding: "13",
        nextValue: "10",
      },
      10,
    );
    expect(Object.keys(errors).sort()).toEqual([
      "padding",
      "prefix",
      "separator",
      "suffix",
    ]);
  });
});

describe("numberSequencePatch", () => {
  it("sends only what changed, as numbers where the API expects numbers", () => {
    expect(
      numberSequencePatch(sequence, {
        ...draftFromSequence(sequence),
        padding: "4",
        nextValue: "100",
      }),
    ).toEqual({ padding: 4, nextValue: 100 });
    expect(numberSequencePatch(sequence, draftFromSequence(sequence))).toEqual(
      {},
    );
  });
});
