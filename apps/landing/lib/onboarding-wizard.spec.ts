import {
  buildSubmitPayload,
  canLeaveStep,
  describeSlugProblem,
  emptyWizardForm,
  furthestReachableStep,
  missingFieldsForStep,
  STEP_LABELS,
  STEP_TITLES,
  suggestSlug,
  WIZARD_STEPS,
  type WizardForm,
} from "./onboarding-wizard";

function filled(overrides: Partial<WizardForm> = {}): WizardForm {
  return {
    ...emptyWizardForm(),
    companyName: "Maseer Group",
    country: "QA",
    requestedSlug: "maseer",
    ownerFirstName: "Saud",
    ownerLastName: "Al Thani",
    email: "saud@maseer.com",
    ...overrides,
  };
}

describe("onboarding wizard step rules", () => {
  describe("organization", () => {
    it("needs a company name and a country, and nothing else", () => {
      expect(missingFieldsForStep("organization", emptyWizardForm())).toEqual([
        "companyName",
        "country",
      ]);

      // Registration number, tax id and address are genuinely optional. Making
      // jurisdiction-specific fields globally mandatory is what the brief warns
      // against, and would block every buyer whose country has no such number.
      expect(missingFieldsForStep("organization", filled())).toEqual([]);
    });

    it("does not accept whitespace as an answer", () => {
      expect(
        missingFieldsForStep("organization", filled({ companyName: "   " })),
      ).toEqual(["companyName"]);
    });
  });

  describe("workspace address", () => {
    it("explains what is wrong rather than only refusing", () => {
      expect(describeSlugProblem("")).toMatch(/choose/i);
      expect(describeSlugProblem("ab")).toMatch(/3 characters/);
      expect(describeSlugProblem("Maseer Group")).toMatch(/lowercase/);
      expect(describeSlugProblem("-maseer")).toMatch(/hyphen/);
      expect(describeSlugProblem("maseer--group")).toMatch(/two hyphens/);
      expect(describeSlugProblem("a".repeat(51))).toMatch(/50 characters/);
    });

    it("accepts an address the server would accept", () => {
      expect(describeSlugProblem("maseer")).toBeNull();
      expect(describeSlugProblem("maseer-group-2")).toBeNull();
    });

    it("does not judge reserved words, on purpose", () => {
      /*
       * `api` is reserved server-side. This mirror deliberately stays silent:
       * the reserved list is derived from the platform's host labels, and a
       * second copy here would drift until a buyer is told `api` is fine and
       * the server then refuses it. Being quiet is honest; being wrong is not.
       */
      expect(describeSlugProblem("api")).toBeNull();
    });

    it("suggests an address from the company name", () => {
      expect(suggestSlug("Maseer Group")).toBe("maseer-group");
      expect(suggestSlug("ABC  Holdings, Inc.")).toBe("abc-holdings-inc");
      expect(suggestSlug("  Leading Space")).toBe("leading-space");
    });

    it("suggests nothing rather than a mangled guess", () => {
      // A name that yields nothing usable must not become "-" or "". The buyer
      // types their own instead of deleting something odd we invented.
      expect(suggestSlug("！！！")).toBe("");
    });
  });

  describe("owner", () => {
    it("needs both names and an email", () => {
      expect(missingFieldsForStep("owner", emptyWizardForm())).toEqual([
        "ownerFirstName",
        "ownerLastName",
        "email",
      ]);
    });

    it("does not require a job title", () => {
      expect(missingFieldsForStep("owner", filled())).toEqual([]);
    });
  });

  describe("agreements", () => {
    const required = ["v-terms", "v-privacy"];

    it("requires every agreement offered, not a subset", () => {
      expect(missingFieldsForStep("agreements", filled(), required)).toEqual(
        required,
      );

      expect(
        missingFieldsForStep(
          "agreements",
          filled({ acceptedVersionIds: ["v-terms"] }),
          required,
        ),
      ).toEqual(["v-privacy"]);
    });

    it("is satisfied when all are accepted", () => {
      expect(
        missingFieldsForStep(
          "agreements",
          filled({ acceptedVersionIds: [...required] }),
          required,
        ),
      ).toEqual([]);
    });

    it("requires nothing when nothing is published", () => {
      // A market with no published terms must not trap the buyer behind a step
      // that has no checkboxes on it.
      expect(missingFieldsForStep("agreements", filled(), [])).toEqual([]);
    });
  });

  describe("progress", () => {
    it("does not let an empty form reach the workspace step", () => {
      expect(furthestReachableStep(emptyWizardForm())).toBe("organization");
    });

    it("stops at the first incomplete step, not the last complete one", () => {
      // Organization and workspace are done, owner is not. The buyer may reach
      // owner and no further, even though agreements would pass vacuously.
      const form = filled({ ownerFirstName: "", ownerLastName: "", email: "" });
      expect(furthestReachableStep(form)).toBe("owner");
    });

    it("reaches review once every step is satisfied", () => {
      expect(furthestReachableStep(filled(), [])).toBe("review");
    });

    it("holds the buyer at agreements until they accept", () => {
      expect(furthestReachableStep(filled(), ["v-terms"])).toBe("agreements");
    });
  });

  describe("submit payload", () => {
    const selection = { planPriceId: "price-1", seatQuantity: 12 };

    it("omits empty optional fields rather than sending empty strings", () => {
      const payload = buildSubmitPayload(filled(), selection);

      /*
       * The API treats undefined as "not asked" and only writes what it is
       * given. Sending "" would blank columns a previous submission filled —
       * the exact distinction buildOrganizationProfile exists to preserve.
       */
      expect(payload.taxId).toBeUndefined();
      expect(payload.addressLine2).toBeUndefined();
      expect(payload.ownerJobTitle).toBeUndefined();
      expect("taxId" in payload).toBe(true);
      expect(payload.acceptedLegalVersionIds).toBeUndefined();
    });

    it("sends the values that were supplied", () => {
      const payload = buildSubmitPayload(
        filled({
          taxId: " QA-123 ",
          estimatedEmployeeCount: "250",
          acceptedVersionIds: ["v-terms"],
        }),
        selection,
      );

      expect(payload.taxId).toBe("QA-123");
      expect(payload.estimatedEmployeeCount).toBe(250);
      expect(payload.acceptedLegalVersionIds).toEqual(["v-terms"]);
    });

    it("still sends contactName, because the API's other callers rely on it", () => {
      expect(buildSubmitPayload(filled(), selection).contactName).toBe(
        "Saud Al Thani",
      );
    });

    it("lower-cases the email and the workspace address", () => {
      const payload = buildSubmitPayload(
        filled({ email: "Saud@Maseer.COM", requestedSlug: "MASEER" }),
        selection,
      );
      expect(payload.email).toBe("saud@maseer.com");
      expect(payload.requestedSlug).toBe("maseer");
    });

    it("drops an unparseable employee count instead of sending NaN", () => {
      const payload = buildSubmitPayload(
        filled({ estimatedEmployeeCount: "lots" }),
        selection,
      );
      expect(payload.estimatedEmployeeCount).toBeUndefined();
    });
  });

  it("treats canLeaveStep as the inverse of having missing fields", () => {
    expect(canLeaveStep("organization", emptyWizardForm())).toBe(false);
    expect(canLeaveStep("organization", filled())).toBe(true);
  });
});

/**
 * The progress rail's labels.
 *
 * The rail reused `STEP_TITLES`, so five steps across one column rendered as
 * "Your org…", "Your wo…", "Worksp…", "Agreem…", "Review" — five truncated
 * fragments that told a buyer less than the step numbers beside them did. The
 * fix was a second, shorter set of labels rather than a narrower font, because
 * a label that has to be truncated to fit is the wrong label.
 *
 * Length is asserted here rather than left to review: the rail has no way to
 * complain, and the next person to add a step will copy whatever is next to it.
 */
describe("wizard step labels", () => {
  it("labels every step", () => {
    for (const step of WIZARD_STEPS) {
      expect(STEP_LABELS[step]?.trim().length).toBeGreaterThan(0);
      expect(STEP_TITLES[step]?.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps every rail label short enough not to be clipped", () => {
    /*
     * Fifteen characters is what one segment of a five-across rail holds at the
     * rail's own type size. "Workspace administrator" is 23 and is exactly what
     * produced "Worksp…".
     */
    for (const step of WIZARD_STEPS) {
      expect(STEP_LABELS[step].length).toBeLessThanOrEqual(15);
    }
  });

  it("keeps the labels distinguishable from one another", () => {
    // Shortening must not turn two steps into the same word.
    const labels = WIZARD_STEPS.map((step) => STEP_LABELS[step]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
