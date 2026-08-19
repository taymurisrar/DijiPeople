import {
  LegalDocumentType,
  LegalDocumentVersionStatus,
  PrismaClient,
  SubprocessorCategory,
  SubprocessorStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Seeds the legal document set and the subprocessor list.
 *
 * EVERYTHING IS SEEDED AS A DRAFT, DELIBERATELY. A draft is not publicly
 * resolvable — `PublicLegalController` serves published versions or 404 — so
 * running this puts reviewable text in front of an operator without putting
 * unreviewed legal text in front of a customer. Publishing is a separate,
 * explicit act.
 *
 * TWO THINGS ARE NEVER WRITTEN HERE:
 *
 *   A legal entity. DijiPeople is not incorporated, so no document names an
 *   operator, a registration number, a registered office or a tax number. A
 *   page that names nobody is incomplete; a page that names a company that does
 *   not exist is false, and the second is worse.
 *
 *   A certification. No SOC 2, ISO 27001, HIPAA, GDPR certification, PCI, uptime
 *   SLA or support response time appears anywhere below, because none of them is
 *   true. The security document says only what the code actually does, and every
 *   claim in it is one this repository can evidence.
 *
 * Re-running is safe: documents are matched on slug and drafts are replaced
 * only while they are still drafts. A published version is never touched — see
 * `LegalService.updateDraft`, which refuses it for the same reason.
 */

const REVIEW_BANNER = `> **Draft — not published, and not legal advice.**
>
> This text describes what the DijiPeople platform actually does, written by the
> engineering team from the implementation. It has not been reviewed by a
> lawyer. It is stored as a DRAFT version and is not served publicly until
> somebody publishes it deliberately.
>
> The operator's legal identity is deliberately absent: no entity is registered
> yet, and naming one that does not exist would be worse than naming none.`;

/**
 * The contracting-party clause, as fillable blanks.
 *
 * Previously the entity was simply omitted, which was honest but left the next
 * person to work out *what* was missing and *where* it belonged. These markers
 * say both, so publishing becomes filling five blanks rather than drafting a
 * clause from nothing.
 *
 * Placeholders are only safer than omission because `LegalService.publish`
 * refuses any version that still contains one — otherwise the failure mode is
 * a live Terms of Service reading `{{LEGAL_ENTITY_NAME}}`, which is worse than
 * either. The guard and these markers are one change and must stay together.
 */
const OPERATOR_BLOCK = `## The operator

This service is provided by **{{LEGAL_ENTITY_NAME}}**, a company registered in
{{JURISDICTION}} under registration number {{COMPANY_REGISTRATION_NUMBER}}, with
its registered office at {{REGISTERED_OFFICE_ADDRESS}} and tax registration
{{TAX_REGISTRATION_NUMBER}}.

These terms are governed by the laws of {{JURISDICTION}}.

> Every value above is an unfilled blank. This document cannot be published
> while any remain — see \`LegalService.publish\`.`;

type DocumentSeed = {
  type: LegalDocumentType;
  slug: string;
  title: string;
  description: string;
  content: string;
};

const DOCUMENTS: DocumentSeed[] = [
  {
    type: LegalDocumentType.PRIVACY_POLICY,
    slug: 'privacy',
    title: 'Privacy Policy',
    description: 'What personal data the platform holds, and why.',
    content: `# Privacy Policy

${REVIEW_BANNER}

## What this platform holds

DijiPeople is a multi-tenant HR platform. Personal data falls into two groups
with different controllers.

**Enquiry and account data**, where DijiPeople is the controller: the name,
work e-mail, phone number, company and country given on the contact, partner or
subscribe forms, plus attribution (referring URL, UTM parameters, the page the
form was on) and the technical record of the submission.

**Employee data**, where the customer is the controller and DijiPeople is a
processor: everything a customer's HR administrators put into their workspace —
employee records, attendance, leave, payroll, documents. DijiPeople does not
decide what goes in and does not use it for its own purposes.

## Consent, and how it is recorded

The privacy notice acknowledgement, marketing consent and cookie consent are
recorded separately. Submitting a form never requires agreeing to marketing.

Each acknowledgement stores the **exact version** of the document that was
shown, and published versions are immutable — a correction is published as a new
version and the old one is archived rather than edited. That is what makes an
acknowledgement evidence rather than an assertion.

Marketing consent can be withdrawn at any time. Withdrawal is recorded as a new
entry rather than by editing the original, so the sequence of decisions remains
visible.

## Retention

Enquiry data is retained while the enquiry is live and for the platform's
ordinary business-record period afterwards.

When a customer's subscription ends, their workspace enters a **60-day retention
window** before erasure. The window length is recorded on the customer's own
retention record when it starts, so a later change to the platform default
cannot shorten a period a customer was already told about. See the Data
Retention Policy.

## Rights

Access, correction, erasure and objection requests should be sent to the contact
address on the website. Where DijiPeople is a processor rather than a
controller — which is the case for all employee data inside a workspace — such a
request is passed to the customer who controls it.

## Sub-processors

The service uses third parties for hosting, database, payments and e-mail. They
are listed, with purpose and status, on the Subprocessors page.

## Changes

Material changes are published as a new version with its own effective date.
Previous versions are retained because acknowledgements refer to them.

${OPERATOR_BLOCK}`,
  },
  {
    type: LegalDocumentType.TERMS_OF_SERVICE,
    slug: 'terms',
    title: 'Terms of Service',
    description: 'The terms under which the platform is provided.',
    content: `# Terms of Service

${REVIEW_BANNER}

## The service

DijiPeople provides a multi-tenant HR and business platform. Each customer
receives an isolated workspace. Access is by subscription.

## Accounts and access

The customer nominates a workspace owner during onboarding. The customer is
responsible for who they grant access to, and for the accuracy of what their
administrators enter.

## Subscription and billing

The billable unit is an **active employee**. Employees counted as active are
those in active, probation or notice status; inactive, terminated and deleted
records are not counted. Billing terms, capacity changes and cancellation are
described in the Subscription and Billing Terms.

## Customer data

The customer retains ownership of everything they put into their workspace.
DijiPeople processes it to provide the service and does not use it for any other
purpose.

## Availability

No uptime commitment is offered at this stage. Any service level would be a
contractual term agreed in writing, and none is offered here.

## Suspension and termination

DijiPeople may suspend a workspace for non-payment or for use that breaches the
Acceptable Use Policy. On termination, the retention window in the Data
Retention Policy applies before erasure.

## Limitation

Nothing in this draft states a limitation of liability, an indemnity or a
governing law. Those are exactly the clauses that require a lawyer and a
registered entity, and this document deliberately does not invent them.

${OPERATOR_BLOCK}`,
  },
  {
    type: LegalDocumentType.SUBSCRIPTION_BILLING_TERMS,
    slug: 'billing-terms',
    title: 'Subscription and Billing Terms',
    description: 'How the subscription is priced, measured and changed.',
    content: `# Subscription and Billing Terms

${REVIEW_BANNER}

## The billable unit

One **active employee**. An employee counts when their employment status is
active, probation or notice. Inactive and terminated employees do not count, and
neither do soft-deleted records.

Platform administrators, service accounts and login users that are not employees
are **not** counted. The platform bills for staff, not for logins.

## Capacity

A subscription has a purchased capacity. Usage is sampled daily, and each
billing period records the peak active-employee count, the count at period end,
and the capacity in force. That history is what makes a billed quantity
explainable after the fact.

## Exceeding capacity

Going over purchased capacity is recorded as an episode, not as a daily event. A
small overage is ordinary and is not blocked.

An abnormal jump — far beyond the purchased capacity — is held for review rather
than billed automatically. A bad data import should not produce an invoice for
employees who do not exist.

## Changing capacity

**Increases take effect immediately**, because the people are already working.

**Decreases take effect at renewal.** The current period is paid for, and
reducing capacity mid-period would either withdraw capacity that was paid for or
grant a refund nobody agreed. A decrease below the number of currently active
employees is refused, rather than accepted and applied later when nobody
remembers requesting it.

## Changing plan

Upgrades take effect immediately; downgrades take effect at renewal, for the
same reason.

**A downgrade does not delete data.** It reduces which features are reachable.
The features that will stop being reachable are shown before the change is
confirmed.

## Price and currency

Prices are published per market and resolved by the server. The browser never
supplies a price, a currency or a total. Where no price is published for a
market, checkout is refused rather than estimated.

## Tax

Tax treatment is recorded per order. At the time of writing the platform has no
tax registrations configured, so no tax is charged and the treatment is recorded
as **not determined** — which is deliberately different from recording that tax
does not apply. This section requires review by a tax adviser before it is
published.`,
  },
  {
    type: LegalDocumentType.REFUND_CANCELLATION_POLICY,
    slug: 'refund-policy',
    title: 'Refund and Cancellation Policy',
    description: 'What happens when a customer cancels.',
    content: `# Refund and Cancellation Policy

${REVIEW_BANNER}

## Two different actions

**Cancel renewal.** Billing stops and the workspace stays usable until the date
already paid through. This is the ordinary case.

**Terminate now.** Access ends immediately. This is a deliberate, separate
choice, because it withdraws access to a period the customer has already paid
for.

A pending cancellation can be revoked at any time before it takes effect.

## Refunds

Voluntary refunds for an unused part of a paid period are **not** offered by
default; access continues to the paid-through date instead.

Refunds are issued in specific circumstances — a duplicate payment, a billing
error, a legal requirement, a goodwill decision, or a manual correction. Each
requires a dedicated permission and is recorded with its reason.

## After termination

The retention window in the Data Retention Policy begins when access ends.`,
  },
  {
    type: LegalDocumentType.COOKIE_POLICY,
    slug: 'cookie-policy',
    title: 'Cookie Policy',
    description: 'Which cookies are used and which are optional.',
    content: `# Cookie Policy

${REVIEW_BANNER}

## Categories

**Essential.** Required to serve the site and keep a signed-in session. These
are not optional and are not presented as a choice — a toggle that is then
ignored would be dishonest.

**Functional, analytics and marketing.** Optional. Each is consented to
separately, and a decision to decline is recorded as such, distinct from never
having been asked.

## What is actually set today

The platform sets **essential cookies only** — session and authentication. No
analytics or marketing trackers are installed at the time of writing.

That is why no intrusive consent banner is shown: there is nothing
non-essential to consent to. The category machinery exists so that if a
non-essential script is ever added, it is category-controlled from the first
day rather than added silently.

## Changing your mind

A recorded cookie decision can be changed at any time. Decisions are appended,
so the history of what was chosen and when remains available.`,
  },
  {
    type: LegalDocumentType.ACCEPTABLE_USE_POLICY,
    slug: 'acceptable-use',
    title: 'Acceptable Use Policy',
    description: 'What the platform may not be used for.',
    content: `# Acceptable Use Policy

${REVIEW_BANNER}

## Not permitted

- Uploading content the customer has no right to process, including personal
  data collected without a lawful basis.
- Attempting to reach another tenant's data, or probing for a way to.
- Automated traffic intended to degrade the service.
- Reverse engineering, or reselling access without a written agreement.
- Using the platform to store data that is unlawful in the customer's
  jurisdiction.

## Tenant boundaries

Each workspace is isolated, and every request is scoped to the authenticated
user's tenant. Attempting to cross that boundary is a breach of this policy
regardless of whether it succeeds.

## Enforcement

A breach may lead to suspension. Where suspension follows, the Data Retention
Policy governs what happens to the data.`,
  },
  {
    type: LegalDocumentType.SECURITY_NOTICE,
    slug: 'security',
    title: 'Security',
    description: 'The security controls this platform actually implements.',
    content: `# Security

${REVIEW_BANNER}

Every statement below describes a control that exists in the codebase. Nothing
here is aspirational, and no certification is claimed.

## What is implemented

**Tenant isolation.** Every query against tenant-owned data is scoped by the
tenant on the authenticated session. The tenant is never taken from a request
body, query string or header. Cross-tenant access is exercised by a dedicated
database-backed test suite that attempts to reach one tenant's records with
another tenant's session.

**Authentication.** Per-client JWTs — the tenant product, the platform admin and
the desktop agent each have their own signing secret and audience. A token
issued for one cannot be used against another. Sessions are verified against a
live session record on every request, so revocation takes effect immediately.

**Authorization.** Two permission systems are enforced together, and a route
requires both. Row-level scope is applied separately, so holding a permission
does not grant access to every record of that type.

**Encryption in transit.** HTTPS.

**Integration credentials at rest.** Third-party credentials are encrypted with a
dedicated key. In production the platform refuses to start without that key
rather than storing them in plaintext.

**Audit.** State-changing operations record before and after snapshots.

**Erasure.** Tenant erasure is executed as an explicit, ordered sequence rather
than a cascade, and the order is re-derived from the schema by an automated
check so it cannot drift.

## What is NOT claimed

- No SOC 2, ISO 27001, HIPAA, PCI or GDPR certification. None has been obtained.
- No uptime or availability SLA.
- No 24/7 support commitment.
- No data-residency guarantee. A hosting region can be recorded per workspace,
  but no promise is made about where data is stored until the infrastructure
  supports one.
- No claim about encryption at rest beyond what the hosting and database
  providers offer by default; see the Subprocessors page for who they are.

## Reporting a vulnerability

Report suspected vulnerabilities to the security contact on the website. Please
do not test against another customer's workspace.`,
  },
  {
    type: LegalDocumentType.DATA_RETENTION_POLICY,
    slug: 'data-retention',
    title: 'Data Retention Policy',
    description: 'How long data is kept, and what pauses deletion.',
    content: `# Data Retention Policy

${REVIEW_BANNER}

## The retention window

When a subscription terminates, the workspace enters a retention window of
**60 days** before its data is erased.

The window length is recorded on the workspace's own retention record at the
moment it starts. A later change to the platform default therefore cannot
shorten a period a customer has already been told about.

A second termination does not restart the clock.

## Holds

Erasure can be suspended by a hold — legal, security, billing dispute or
administrative. Several holds can exist at once for different reasons, and
releasing one does not release the others. Erasure resumes only when the last
hold is released. Placing and releasing a hold are both audited.

## Deletion requests

A workspace owner can **request** deletion. The request is reviewed by a
platform operator; it is never executed on submission. Confirmation requires
typing the workspace name, checked on the server.

## What erasure removes

Relational tenant data, stored files, integration credentials and tokens, and
tenant configuration.

## What is retained

A record that the erasure happened — when, why and who authorised it — is
retained deliberately, because it is the evidence the erasure occurred. It does
not contain the erased content.

Commercial records that belong to the customer rather than the workspace —
orders, refunds and contracts — are retained for business-record purposes.

## Backups

Erasure removes data from the live database immediately. Backup copies held by
the hosting provider expire on that provider's own schedule, which means erased
data can persist in backups for a period after live erasure. **No claim of
instantaneous backup erasure is made**, because it would not be true. The exact
provider retention period must be confirmed and stated here before publication.`,
  },
  {
    type: LegalDocumentType.DATA_PROCESSING_ADDENDUM,
    slug: 'dpa',
    title: 'Data Processing Addendum',
    description: 'Controller and processor roles for customer data.',
    content: `# Data Processing Addendum

${REVIEW_BANNER}

> This document in particular must not be published without legal review. A DPA
> is a contract, and this draft is a description of the technical reality it
> would need to describe — not a substitute for one.

## Roles

For employee and workspace data, the **customer is the controller** and
DijiPeople is the **processor**. The customer decides what is collected and why.

For enquiry, account and billing data, DijiPeople is the controller.

## Scope of processing

DijiPeople processes customer data only to provide the service: storing it,
making it available to the customer's authorised users, and performing the
functions the customer invokes. It is not used for any other purpose, and it is
not sold.

## Sub-processors

Listed on the Subprocessors page with purpose and status. That page is the
authoritative list.

## Security

The controls in place are described in the Security document. That list is
deliberately limited to what exists.

## Assistance

DijiPeople assists the customer in responding to data-subject requests. Because
the customer controls workspace data, such requests are directed to them.

## Deletion

On termination, the retention window and holds described in the Data Retention
Policy apply, after which data is erased.

## Not yet stated

International transfer mechanisms, audit rights, breach-notification timelines
and liability all require a registered entity, a jurisdiction and legal review.
None is asserted here.

${OPERATOR_BLOCK}`,
  },
  {
    type: LegalDocumentType.SUBPROCESSOR_LIST,
    slug: 'subprocessors',
    title: 'Subprocessors',
    description: 'Third parties that process customer data.',
    content: `# Subprocessors

${REVIEW_BANNER}

The table on this page is generated from the platform's subprocessor records
rather than written by hand, so it cannot drift from what is configured.

Only providers that genuinely process customer data are listed. A provider is
recorded because it is in the path, not because it might be one day.

Where a processing region is not known it is shown as unknown rather than
guessed. A plausible-looking region on a published disclosure would be a false
statement about where data lives.

## Changes

New subprocessors are added to this list. The list carries an effective date per
entry so a reader can see when each was introduced.`,
  },
];

/**
 * Providers that actually process customer data.
 *
 * Regions are left null. The deployment targets are configurable and this
 * repository does not record which region any of them runs in — and a published
 * disclosure is exactly the wrong place to guess.
 */
const SUBPROCESSORS = [
  {
    name: 'Render',
    purpose: 'Application hosting for the API service.',
    category: SubprocessorCategory.INFRASTRUCTURE,
    websiteUrl: 'https://render.com',
  },
  {
    name: 'Vercel',
    purpose: 'Hosting for the public site, tenant product and admin surfaces.',
    category: SubprocessorCategory.INFRASTRUCTURE,
    websiteUrl: 'https://vercel.com',
  },
  {
    name: 'Neon',
    purpose: 'Managed PostgreSQL. Holds all tenant and platform data.',
    category: SubprocessorCategory.DATABASE,
    websiteUrl: 'https://neon.tech',
  },
  {
    name: 'Stripe',
    purpose:
      'Payment processing and subscription billing. Receives billing contact details, never employee data.',
    category: SubprocessorCategory.PAYMENTS,
    websiteUrl: 'https://stripe.com',
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const now = new Date();
  let documentsCreated = 0;
  let draftsWritten = 0;
  let draftsSkipped = 0;

  for (const seed of DOCUMENTS) {
    const document = await prisma.legalDocument.upsert({
      where: { slug: seed.slug },
      create: {
        type: seed.type,
        slug: seed.slug,
        title: seed.title,
        description: seed.description,
      },
      update: { title: seed.title, description: seed.description },
      select: { id: true, slug: true },
    });
    documentsCreated += 1;

    // A published version is never touched. Re-running this seed must not
    // rewrite text somebody has already acknowledged.
    const published = await prisma.legalDocumentVersion.findFirst({
      where: {
        legalDocumentId: document.id,
        status: LegalDocumentVersionStatus.PUBLISHED,
      },
      select: { id: true },
    });

    if (published) {
      draftsSkipped += 1;
      continue;
    }

    const existingDraft = await prisma.legalDocumentVersion.findFirst({
      where: {
        legalDocumentId: document.id,
        status: LegalDocumentVersionStatus.DRAFT,
      },
      orderBy: { version: 'desc' },
      select: { id: true },
    });

    if (existingDraft) {
      await prisma.legalDocumentVersion.update({
        where: { id: existingDraft.id },
        data: {
          contentMarkdown: seed.content,
          changeSummary: 'Regenerated by seed-legal.',
        },
      });
    } else {
      const latest = await prisma.legalDocumentVersion.findFirst({
        where: { legalDocumentId: document.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      await prisma.legalDocumentVersion.create({
        data: {
          legalDocumentId: document.id,
          version: (latest?.version ?? 0) + 1,
          status: LegalDocumentVersionStatus.DRAFT,
          contentMarkdown: seed.content,
          changeSummary: 'Initial draft, seeded from the implementation.',
          effectiveFrom: now,
        },
      });
    }
    draftsWritten += 1;
  }

  for (const provider of SUBPROCESSORS) {
    await prisma.subprocessor.upsert({
      where: { name: provider.name },
      create: {
        name: provider.name,
        purpose: provider.purpose,
        category: provider.category,
        websiteUrl: provider.websiteUrl,
        // Null on purpose. See the note on SUBPROCESSORS above.
        processingRegion: null,
        status: SubprocessorStatus.ACTIVE,
        effectiveFrom: now,
      },
      update: { purpose: provider.purpose, category: provider.category },
    });
  }

  console.log(
    JSON.stringify(
      {
        documents: documentsCreated,
        draftsWritten,
        draftsSkippedBecausePublished: draftsSkipped,
        subprocessors: SUBPROCESSORS.length,
        published: 0,
        note: 'Everything is a DRAFT. Nothing is publicly resolvable until it is published deliberately.',
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
