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
 * These documents bootstrap the first production legal versions. They are
 * written as DRAFT versions first and are made public only by the explicit
 * `legal:publish --confirm` step.
 *
 * Re-running is safe for published documents: once any published version exists,
 * this seed does not rewrite that document's legal text.
 */

/**
 * The operator, as supplied by the business on 2026-08-20.
 *
 * These are facts about a real registered company, not invented values — which
 * is the line the rest of this file holds. They were confirmed field by field,
 * including which of the two numbers was the SECP registration and which the
 * NTN, because putting them the wrong way round in a contract is not a typo.
 *
 * The clause below contains the supplied registered operator details used by
 * the legal documents.
 */
const OPERATOR = {
  legalName: 'DijiPeople (SMC-PRIVATE) LIMITED',
  /** SECP incorporation number. */
  registrationNumber: '38252358',
  /** National Tax Number. */
  taxNumber: '748234783',
  registeredOffice: 'Hasan Lodge, Block 7, F.B. Area, Karachi, Pakistan',
  jurisdiction: 'Pakistan',
} as const;

/**
 * The contracting-party clause.
 *
 * Shared contracting-party clause used by documents that need to identify the
 * service provider and governing jurisdiction.
 */
const OPERATOR_BLOCK = `## The operator

This service is provided by **${OPERATOR.legalName}**, a company incorporated in
${OPERATOR.jurisdiction} under SECP registration number
${OPERATOR.registrationNumber}, with its registered office at
${OPERATOR.registeredOffice} and National Tax Number ${OPERATOR.taxNumber}.

These terms are governed by the laws of ${OPERATOR.jurisdiction}.`;

type DocumentSeed = {
  type: LegalDocumentType;
  slug: string;
  title: string;
  description: string;
  content: string;
};

/*
 * Exported so the publish guard can be run against it in a unit test.
 *
 * `npm --workspace api run release` — Render's pre-deploy command — ends in
 * `legal:publish --confirm`, and that step refuses any document whose own text
 * says it is an unreviewed draft. Correct behaviour, and it meant a document
 * with a leftover banner failed the *deployment* rather than a test: two
 * consecutive production deploys ended `pre_deploy_failed` and the API sat on
 * an old commit for a day. `seed-legal-publishable.spec.ts` now asks the same
 * question in CI, where the answer is cheap.
 */
export const DOCUMENTS: DocumentSeed[] = [
  {
    type: LegalDocumentType.PRIVACY_POLICY,
    slug: 'privacy',
    title: 'Privacy Policy',
    description: 'What personal data the platform holds, and why.',
    content: `# Privacy Policy


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


## The service

DijiPeople provides a multi-tenant HR and business platform. Each customer
receives an isolated workspace. Access is by subscription.

## Accounts and access

The customer nominates a workspace owner during onboarding. The customer is
responsible for who they grant access to, and for the accuracy of what their
administrators enter.

## Subscription and billing

Subscriptions bought online are priced **per active employee**, for the billing
period chosen. Each plan sets a minimum number of seats that is billed even when
the workspace has fewer active employees, and the plan chosen also determines
which modules are included.

**Flat pricing is available by arrangement.** A flat subscription covers an
agreed number of employees for a single fee, with a stated rate for each
employee above that number. It is not offered through online checkout; it is
agreed with our team.

How an employee is counted, and how capacity is measured, are described in the
Subscription and Billing Terms, along with billing terms, capacity changes and
cancellation.

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

## Liability

To the maximum extent permitted by applicable law, DijiPeople is not liable for
indirect, incidental, special or consequential loss, loss of profit, loss of
revenue or loss of anticipated savings arising from use of the service.

DijiPeople's aggregate liability arising out of or relating to the service will
not exceed the fees paid by the customer for the affected subscription during
the twelve months immediately preceding the event giving rise to the claim.
Nothing in these terms excludes liability that cannot lawfully be excluded or
limited.

## Indemnity

The customer is responsible for ensuring that it has the rights and lawful basis
required to upload and process data through the service. The customer will
indemnify DijiPeople against third-party claims arising from unlawful customer
content, misuse of the service, or a breach of these terms by the customer, to
the extent permitted by applicable law.

## Governing law and disputes

These terms are governed by the laws of Pakistan. The parties will first try in
good faith to resolve any dispute through written notice and reasonable business
discussion. If it cannot be resolved, the courts of competent jurisdiction in
Pakistan will have jurisdiction, subject to any mandatory law that applies to
the customer.

${OPERATOR_BLOCK}`,
  },
  {
    type: LegalDocumentType.SUBSCRIPTION_BILLING_TERMS,
    slug: 'billing-terms',
    title: 'Subscription and Billing Terms',
    description: 'How the subscription is priced, measured and changed.',
    content: `# Subscription and Billing Terms


## What you pay

**If you bought online: a fee per active employee**, for the billing period you
chose. Your plan sets a minimum number of seats. That minimum is what you are
billed if you have fewer active employees than it — so a plan with a ten-seat
minimum costs the same at six employees as at ten.

**If you agreed flat terms with our team:** a single fee covering an agreed
number of employees, plus a stated rate for each employee above that number. The
agreed number and the rate are in your order.

The plan you choose also determines which modules are included.

## How employees are counted

Headcount is measured daily. On a per-employee subscription it is what you are
billed on, subject to your plan's minimum. On flat terms it decides whether any
employees fall above your agreed number, and the usage history is what makes a
capacity dispute answerable either way.

An employee counts as active when their employment status is active, probation
or notice. Inactive and terminated employees do not count, and neither do
soft-deleted records. Platform administrators, service accounts and login users
that are not employees are not counted either — the count is of staff, not
logins.

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

Prices are exclusive of taxes unless the checkout or order states otherwise.
Any tax that DijiPeople is legally required to collect will be shown on the
relevant order, invoice or checkout before payment. Where tax is not collected
by DijiPeople, the customer remains responsible for any tax obligations that
apply to its purchase under applicable law.

${OPERATOR_BLOCK}`,
  },
  {
    type: LegalDocumentType.REFUND_CANCELLATION_POLICY,
    slug: 'refund-policy',
    title: 'Refund and Cancellation Policy',
    description: 'What happens when a customer cancels.',
    content: `# Refund and Cancellation Policy


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

Because only essential cookies are currently set, the platform does not request
consent for analytics or marketing cookies that are not in use. The category
machinery exists so that if a non-essential script is added later, it can be
controlled by the relevant consent category before activation.

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


The controls below describe the security measures currently implemented by the
platform. No certification is claimed unless DijiPeople states one separately in
writing.

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

Erasure removes data from the live production database through the platform's
erasure process. Residual copies may remain temporarily in managed provider
backups until those backups expire or are overwritten under the provider's
ordinary retention cycle. Backup copies are not restored for ordinary customer
access after an erasure request has been completed.`,
  },
  {
    type: LegalDocumentType.DATA_PROCESSING_ADDENDUM,
    slug: 'dpa',
    title: 'Data Processing Addendum',
    description: 'Controller and processor roles for customer data.',
    content: `# Data Processing Addendum


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

## International transfers

Where a subprocessor or hosting provider processes data outside the customer's
country, DijiPeople will use the contractual and organisational measures
available through that provider and any additional transfer mechanism required
by applicable law. The current Subprocessors document identifies the providers
used by the service.

## Security incidents

DijiPeople will notify the customer without undue delay after becoming aware of
a confirmed personal-data breach affecting customer data and will provide the
information reasonably available to support the customer's regulatory or
data-subject obligations.

## Audit and information rights

On reasonable written request, DijiPeople will provide information reasonably
necessary to demonstrate the processing and security commitments in this DPA.
Any broader audit request must protect other customers' confidentiality and the
security of the platform and may be subject to reasonable scope, timing and cost
controls.

## Liability

Liability under this DPA is subject to the liability provisions of the agreement
or Terms of Service governing the customer's use of DijiPeople, except where
applicable law requires otherwise.

${OPERATOR_BLOCK}`,
  },
  {
    type: LegalDocumentType.SUBPROCESSOR_LIST,
    slug: 'subprocessors',
    title: 'Subprocessors',
    description: 'Third parties that process customer data.',
    content: `# Subprocessors


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

/**
 * Writes the seeded legal set into the given database.
 *
 * Exported so it can be *called*, not only executed. `legal-seed.e2e-spec.ts`
 * asserts what this seed produces — the ten routes, the DRAFT-only rule, the
 * absence of a fabricated legal entity — and it used to assume some earlier CI
 * step had run the seed for it. Nothing did: the database e2e job runs
 * `seed:demo` and `seed:admin`, never `seed:legal`, so the suite queried an
 * empty table and reported ten missing documents as if the seed were wrong.
 *
 * A test of a seed should run that seed. Everything here upserts and never
 * rewrites a published version, so calling it twice is a no-op.
 */
export async function seedLegalDocuments(prisma: PrismaClient): Promise<{
  documents: number;
  draftsWritten: number;
  draftsSkippedBecausePublished: number;
  subprocessors: number;
}> {
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
          changeSummary: 'Updated from production legal seed.',
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
          changeSummary:
            'Initial production legal version seeded from source control.',
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

  return {
    documents: documentsCreated,
    draftsWritten,
    draftsSkippedBecausePublished: draftsSkipped,
    subprocessors: SUBPROCESSORS.length,
  };
}

/** The CLI wrapper: owns the connection, prints the summary, disconnects. */
async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const summary = await seedLegalDocuments(prisma);
    console.log(
      JSON.stringify(
        {
          ...summary,
          published: 0,
          note: 'Legal versions were seeded as DRAFT and are ready for explicit publication through legal:publish --confirm.',
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Only when run as a script. Importing this module — which the e2e suite does,
// to call the seed it asserts on — must not connect to a database or exit the
// process.
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
