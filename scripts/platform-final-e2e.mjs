import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../services/api/.env", import.meta.url)) });

const landingBase = "http://127.0.0.1:3000";
const adminBase = "http://127.0.0.1:3002";
const apiBase = "http://127.0.0.1:4000/api";
const runId = `codex-final-${Date.now()}`;

async function json(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(`${response.status} ${payload.message ?? response.statusText}`);
  return payload;
}

const loginResponse = await fetch(`${adminBase}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    rememberMe: false,
  }),
});
await json(loginResponse);
const accessToken = loginResponse.headers
  .getSetCookie()
  .map((value) => value.split(";", 1)[0])
  .find((value) => value.includes("_access_token="))
  ?.split("=", 2)[1];
if (!accessToken) throw new Error("Admin login did not return an access token cookie.");
const apiHeaders = {
  authorization: `Bearer ${accessToken}`,
  "content-type": "application/json",
  "x-dijipeople-app": "admin",
};
const api = (path, init = {}) =>
  fetch(`${apiBase}${path}`, { ...init, headers: { ...apiHeaders, ...init.headers } });

const leadEmail = `${runId}@example.com`;
const leadSubmit = await json(
  await fetch(`${landingBase}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": runId },
    body: JSON.stringify({
      firstName: "Codex",
      lastName: "Lifecycle QA",
      companyName: `DijiPeople ${runId}`,
      workEmail: leadEmail,
      phoneNumber: "+966500000000",
      industry: "Software",
      companySize: "11-50",
      country: "Saudi Arabia",
      message: "Automated end-to-end lifecycle verification record.",
    }),
  }),
);
const leadId = leadSubmit.id ?? leadSubmit.lead?.id;
if (!leadId) throw new Error("Landing lead submission did not return a lead ID.");
await json(
  await api(`/super-admin/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "CONTACTED", subStatus: "Discovery scheduled" }),
  }),
);
await json(
  await api(`/super-admin/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "QUALIFIED", isQualified: true, subStatus: "Commercial review" }),
  }),
);
let conversion = { ok: false, blockedBy: null };
const conversionResponse = await api(`/super-admin/leads/${leadId}/convert`, {
  method: "POST",
  body: JSON.stringify({}),
});
if (conversionResponse.ok) {
  const customer = await conversionResponse.json();
  conversion = { ok: true, customerCreated: Boolean(customer.id), blockedBy: null };
} else {
  const payload = await conversionResponse.json().catch(() => ({}));
  conversion = { ok: false, blockedBy: payload.message ?? `HTTP ${conversionResponse.status}` };
}

const eventResponse = await json(
  await api(`/platform/events?correlationId=${encodeURIComponent(runId)}&pageSize=20`),
);
if (!eventResponse.items?.some((item) => item.eventCode === "LEAD_SUBMITTED"))
  throw new Error("LEAD_SUBMITTED was not observable by correlation ID.");

const partnerEmail = `partner-${runId}@example.com`;
const inquiry = await json(
  await fetch(`${landingBase}/api/partners/inquiries`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `${runId}-partner` },
    body: JSON.stringify({
      type: "COMPANY",
      companyName: `Partner ${runId}`,
      contactFirstName: "Codex",
      contactLastName: "Partner QA",
      email: partnerEmail,
      country: "Saudi Arabia",
      message: "Automated partner intake verification record.",
      consentAccepted: true,
      source: "codex-final-e2e",
    }),
  }),
);
const inquiryList = await json(await api("/partner-experience/inquiries"));
const inquiryId =
  inquiry.id ??
  inquiry.inquiry?.id ??
  inquiryList.items?.find((item) => item.email === partnerEmail)?.id;
if (!inquiryId) throw new Error("Partner inquiry did not return an ID.");
const qualifiedPartner = await json(
  await api(`/partner-experience/inquiries/${inquiryId}/qualify`, {
    method: "POST",
    body: JSON.stringify({ notes: "Qualified by automated final verification.", currencyCode: "USD" }),
  }),
);
if (!qualifiedPartner.partner?.id)
  throw new Error("Qualified partner response did not include the created partner.");
const partnerEvents = await json(
  await api(`/platform/events?correlationId=${encodeURIComponent(`${runId}-partner`)}&pageSize=20`),
);
if (
  !partnerEvents.items?.some(
    (item) => item.eventCode === "PARTNER_INQUIRY_SUBMITTED",
  )
)
  throw new Error("PARTNER_INQUIRY_SUBMITTED was not observable by correlation ID.");

const richHtml =
  '<h2>Commercial terms</h2><p>Normal paragraph with <strong>bold terms</strong> and <em>italic guidance</em>.</p><ul><li>Bulleted term</li></ul><ol><li>First numbered term<ul><li>Nested condition</li></ul></li><li>Second numbered term</li></ol><table><thead><tr><th>Item</th><th>Value</th><th>Notes</th></tr></thead><tbody><tr><td>Seats</td><td>25</td><td>Licensed</td></tr><tr><td>Term</td><td>12 months</td><td>Renewable</td></tr></tbody></table>';
const contract = await json(
  await api("/contracts", {
    method: "POST",
    body: JSON.stringify({
      title: `Structured agreement ${runId}`,
      contractType: "SERVICE_AGREEMENT",
      counterpartyName: `DijiPeople QA ${runId}`,
      counterpartyEmail: leadEmail,
      agreementCategory: "Quality assurance",
      currencyCode: "USD",
      effectiveDate: "2026-08-11",
      expiryDate: "2027-08-11",
      contentHtml: richHtml,
    }),
  }),
);
const contractId = contract.id;
if (!contractId) throw new Error("Contract creation did not return an ID.");
const reloadedContract = await json(await api(`/contracts/${contractId}`));
const currentVersion = reloadedContract.versions?.find(
  (item) => Number(item.version) === Number(reloadedContract.currentVersionNumber),
);
for (const marker of ["<h2>", "<strong>", "<em>", "<ul>", "<ol>", "<table>"]) {
  if (!currentVersion?.contentHtml?.includes(marker))
    throw new Error(`Saved contract did not preserve ${marker} structure.`);
}
const generated = {};
for (const format of ["pdf", "docx"]) {
  const response = await api(`/contracts/${contractId}/generate/${format}`, { method: "POST", body: "{}" });
  if (!response.ok) throw new Error(`${format.toUpperCase()} generation failed with ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  generated[format] = { ok: bytes.length > 500, bytes: bytes.length };
  if (!generated[format].ok) throw new Error(`${format.toUpperCase()} output was unexpectedly small.`);
}
const agreementEvents = await json(
  await api(`/platform/events?eventCode=AGREEMENT_GENERATED&pageSize=100`),
);
if (
  !agreementEvents.items?.some(
    (item) => item.entityId === contractId && item.source === "API",
  )
)
  throw new Error("AGREEMENT_GENERATED was not observable as an API event.");

const invalidDates = await api("/contracts", {
  method: "POST",
  body: JSON.stringify({
    title: `Invalid date contract ${runId}`,
    contractType: "SERVICE_AGREEMENT",
    counterpartyName: "Validation QA",
    effectiveDate: "2027-08-11",
    expiryDate: "2026-08-11",
  }),
});
if (invalidDates.status !== 400)
  throw new Error(`Cross-date validation returned ${invalidDates.status}, expected 400.`);

process.stdout.write(
  `${JSON.stringify(
    {
      runId,
      landingLead: { submitted: true, contacted: true, qualified: true, conversion },
      businessEvents: { leadSubmittedObserved: true },
      partnerJourney: {
        inquirySubmitted: true,
        inquiryEventObserved: true,
        qualified: true,
        agreementGateEnforced: qualifiedPartner.agreementRequired === true,
      },
      agreementJourney: {
        created: true,
        richHtmlReloaded: true,
        generated,
        generationEventObserved: true,
        invalidCrossDatesRejected: true,
      },
      inspectRoutes: {
        lead: `/leads/${leadId}`,
        partnerInquiry: `/partner-inquiries/${inquiryId}`,
        partner: `/partners/${qualifiedPartner.partner.id}`,
        agreement: `/contracts/${contractId}`,
      },
    },
    null,
    2,
  )}\n`,
);
