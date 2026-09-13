import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildCreatePayload,
  buildDraftPreviewPayload,
  buildSavedPreviewPayload,
  buildTestSendPayload,
  buildUpdatePayload,
  describeTestSendResult,
  htmlToPlainText,
  insertTokenAt,
  isBodyEmpty,
  templateTokens,
  unknownTokens,
} from "./email-template-editing";

/*
 * ITEM-0181. The editor stopped sending hand-written HTML and JSON; these
 * builders now decide the request body. The API rejects an unknown field with a
 * 400 (`forbidNonWhitelisted`), so the payload is pinned to a fixture that
 * `services/api/src/modules/notifications/dto/email-template-payload.spec.ts`
 * validates against the real DTOs. Change the builder without the fixture and
 * this fails; change the fixture into something the API refuses and that spec
 * fails.
 */
const fixture = JSON.parse(
  readFileSync(join(__dirname, "email-template-payload.fixture.json"), "utf8"),
) as Record<string, Record<string, unknown>>;

const HTML =
  "<p>Hello {{recipientName}},</p><p>Your payslip for <strong>{{payrollPeriod}}</strong> is ready.</p>";
const SUBJECT = "Your payslip for {{payrollPeriod}} is available";
const TENANT_SCOPE = {
  scopeLevel: "TENANT" as const,
  scopeId: null,
  moduleKey: null,
};

describe("email template payloads match the API seam fixture", () => {
  it("builds the create payload", () => {
    expect(
      buildCreatePayload(
        {
          name: "  Payslip available ",
          eventCode: "PAYSLIP_AVAILABLE",
          subjectTemplate: ` ${SUBJECT} `,
          htmlTemplate: HTML,
          status: "DRAFT",
        },
        TENANT_SCOPE,
      ),
    ).toEqual(fixture.create);
  });

  it("builds the update payload without a key, event or variables", () => {
    const payload = buildUpdatePayload(
      { name: "Payslip available", subjectTemplate: SUBJECT, htmlTemplate: HTML },
      TENANT_SCOPE,
    );
    expect(payload).toEqual(fixture.update);
    expect(payload).not.toHaveProperty("availableVariables");
    expect(payload).not.toHaveProperty("templateKey");
  });

  it("builds both preview payloads and the test send payload", () => {
    const content = { subjectTemplate: SUBJECT, htmlTemplate: HTML };
    expect(buildSavedPreviewPayload(content)).toEqual(fixture.previewSaved);
    expect(buildDraftPreviewPayload("PAYSLIP_AVAILABLE", content)).toEqual(
      fixture.previewDraft,
    );
    expect(buildTestSendPayload(" person@example.com ")).toEqual(
      fixture.testSend,
    );
  });
});

describe("htmlToPlainText", () => {
  it("keeps paragraphs, list items, line breaks and tokens", () => {
    expect(
      htmlToPlainText(
        "<h1>Hi {{recipientName}}</h1><p>Line one<br>Line two</p><ul><li>First</li><li>Second</li></ul>",
      ),
    ).toBe("Hi {{recipientName}}\n\nLine one\nLine two\n\n- First\n- Second");
  });

  it("writes a link as its label and address", () => {
    expect(
      htmlToPlainText('<p><a href="{{activationUrl}}" style="x">Activate account</a></p>'),
    ).toBe("Activate account: {{activationUrl}}");
    expect(htmlToPlainText('<a href="{{resetUrl}}">{{resetUrl}}</a>')).toBe(
      "{{resetUrl}}",
    );
  });

  it("decodes entities and treats markup-only bodies as empty", () => {
    expect(htmlToPlainText("<p>A &amp; B &lt;ok&gt;</p>")).toBe("A & B <ok>");
    expect(isBodyEmpty("<p><br></p>")).toBe(true);
    expect(isBodyEmpty("<p>{{recipientName}}</p>")).toBe(false);
  });
});

describe("variable tokens", () => {
  it("inserts a token at the caret, replacing a selection", () => {
    expect(insertTokenAt("Hello ,", 6, 6, "recipientName")).toEqual({
      value: "Hello {{recipientName}},",
      caret: 23,
    });
    expect(insertTokenAt("Hello NAME", 6, 10, "recipientName")).toEqual({
      value: "Hello {{recipientName}}",
      caret: 23,
    });
    expect(insertTokenAt("Hi", null, null, "tenantName").value).toBe(
      "Hi{{tenantName}}",
    );
  });

  it("reports tokens the event does not supply", () => {
    expect(templateTokens("{{ a }} {{b}} {{a}}")).toEqual(["a", "b"]);
    expect(
      unknownTokens(
        { subjectTemplate: "{{payrollPeriod}}", htmlTemplate: "<p>{{typo}}</p>" },
        [{ key: "payrollPeriod", label: "Pay period", sample: "Sep" }],
      ),
    ).toEqual(["typo"]);
  });
});

describe("describeTestSendResult", () => {
  it("never reports an undelivered or skipped send as sent", () => {
    expect(describeTestSendResult("SENT").tone).toBe("success");
    expect(describeTestSendResult("NOT_DELIVERED").tone).toBe("error");
    expect(describeTestSendResult("SKIPPED").tone).toBe("error");
    expect(describeTestSendResult("FAILED").tone).toBe("error");
  });
});
