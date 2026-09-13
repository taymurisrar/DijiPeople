/*
 * ITEM-0181. The pure half of the email template editor: what gets sent to the
 * API, how the plain-text body is derived, and how a variable token is placed.
 *
 * Kept free of React and the DOM so it runs under this app's node-only jest
 * config. The payload builders are asserted against
 * `email-template-payload.fixture.json`, and the API's DTO spec validates the
 * same fixture, so the shape the editor sends and the shape the server accepts
 * are tested against the same bytes.
 */

export type EmailTemplateVariable = {
  key: string;
  label: string;
  sample: string;
};

export type EmailTemplateScopeInput = {
  scopeLevel: "TENANT" | "ORGANIZATION" | "BUSINESS_UNIT" | "DEPARTMENT" | "TEAM";
  scopeId: string | null;
  moduleKey: string | null;
};

export type EmailTemplateContent = {
  subjectTemplate: string;
  htmlTemplate: string;
};

export type CreateTemplateForm = EmailTemplateContent & {
  name: string;
  eventCode: string;
  status: "DRAFT" | "ACTIVE";
};

export type UpdateTemplateForm = EmailTemplateContent & {
  name: string;
};

const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

export function formatToken(key: string) {
  return `{{${key}}}`;
}

export function templateTokens(...values: Array<string | null | undefined>) {
  const tokens = new Set<string>();
  for (const value of values) {
    for (const match of (value ?? "").matchAll(TOKEN_PATTERN)) {
      if (match[1]) tokens.add(match[1]);
    }
  }
  return [...tokens].sort();
}

/* Tokens the event does not supply; the server refuses to save these. */
export function unknownTokens(
  content: EmailTemplateContent,
  variables: readonly EmailTemplateVariable[],
) {
  const supplied = new Set(variables.map((variable) => variable.key));
  return templateTokens(content.subjectTemplate, content.htmlTemplate).filter(
    (token) => !supplied.has(token),
  );
}

/*
 * Places a token at the caret of a plain input, replacing any selection, and
 * returns where the caret should land afterwards.
 */
export function insertTokenAt(
  value: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  key: string,
) {
  const start = clamp(selectionStart ?? value.length, 0, value.length);
  const end = clamp(selectionEnd ?? start, start, value.length);
  const token = formatToken(key);
  return {
    value: `${value.slice(0, start)}${token}${value.slice(end)}`,
    caret: start + token.length,
  };
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/*
 * The text part of the email, derived from the formatted body so the two cannot
 * drift apart. Mail clients that do not render HTML, and spam filters that
 * score a message without a text part, read this.
 */
export function htmlToPlainText(html: string) {
  const text = html
    .replace(/\r?\n/g, " ")
    .replace(
      /<a\b[^>]*\bhref\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href: string, inner: string) => {
        const label = stripTags(inner).trim();
        return !label || label === href ? href : `${label}: ${href}`;
      },
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/td>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|ul|ol|table|tr|blockquote)>/gi, "\n\n");

  return decodeEntities(stripTags(text))
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isBodyEmpty(html: string) {
  return htmlToPlainText(html).length === 0;
}

export function buildCreatePayload(
  form: CreateTemplateForm,
  scope: EmailTemplateScopeInput,
) {
  return {
    name: form.name.trim(),
    eventCode: form.eventCode,
    subjectTemplate: form.subjectTemplate.trim(),
    htmlTemplate: form.htmlTemplate,
    textTemplate: htmlToPlainText(form.htmlTemplate),
    status: form.status,
    scopeLevel: scope.scopeLevel,
    scopeId: scope.scopeId,
    moduleKey: scope.moduleKey,
  };
}

export function buildUpdatePayload(
  form: UpdateTemplateForm,
  scope: EmailTemplateScopeInput,
) {
  return {
    name: form.name.trim(),
    subjectTemplate: form.subjectTemplate.trim(),
    htmlTemplate: form.htmlTemplate,
    textTemplate: htmlToPlainText(form.htmlTemplate),
    scopeLevel: scope.scopeLevel,
    scopeId: scope.scopeId,
    moduleKey: scope.moduleKey,
  };
}

export function buildSavedPreviewPayload(content: EmailTemplateContent) {
  return {
    subjectTemplate: content.subjectTemplate,
    htmlTemplate: content.htmlTemplate,
    textTemplate: htmlToPlainText(content.htmlTemplate),
  };
}

export function buildDraftPreviewPayload(
  eventCode: string,
  content: EmailTemplateContent,
) {
  return { eventCode, ...buildSavedPreviewPayload(content) };
}

export function buildTestSendPayload(recipient: string) {
  return { recipient: recipient.trim() };
}

export type TestSendStatus =
  | "REQUESTED"
  | "PENDING"
  | "PROCESSING"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "SKIPPED"
  | "DRY_RUN"
  | "NOT_DELIVERED";

export function describeTestSendResult(status: TestSendStatus) {
  switch (status) {
    case "SENT":
    case "DELIVERED":
      return { tone: "success" as const, message: "Test email sent." };
    case "QUEUED":
    case "PENDING":
    case "PROCESSING":
    case "REQUESTED":
      return { tone: "success" as const, message: "Test email queued." };
    case "SKIPPED":
      return {
        tone: "error" as const,
        message: "Not sent. Email is turned off for this event.",
      };
    case "NOT_DELIVERED":
      return {
        tone: "error" as const,
        message: "Not delivered. No email delivery is configured.",
      };
    case "DRY_RUN":
      return { tone: "success" as const, message: "Test rendered, not sent." };
    default:
      return { tone: "error" as const, message: "Sending failed." };
  }
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, "");
}

function decodeEntities(value: string) {
  return value.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
