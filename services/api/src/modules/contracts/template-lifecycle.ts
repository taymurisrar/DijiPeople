import { BadRequestException } from '@nestjs/common';
import {
  ContractPartyRole,
  ContractSigningMode,
  ContractType,
} from '@prisma/client';
import { GOVERNING_CUSTOMER_AGREEMENT_TYPES } from './governing-agreement';
import {
  countPlaceholderMarkup,
  unwrapPlaceholderMarkup,
} from './placeholder-markup';
import { parseSignatureTokenKey } from './signature-tokens';

/**
 * The lifecycle gates an agreement template can serve.
 *
 * `lifecycleGatePurpose` was a free-text field, so production holds
 * `customer_onboarding`, `CUSTOMER_CONVERSION` and `LEAD_TO_CUSTOMER` side by
 * side for what the code treats as one thing — and only `TENANT_PROVISIONING`
 * is read by any rule (`assertTenantServiceOrderEligible`). These are the keys
 * the platform actually seeds or enforces, each restricted to the agreement
 * types that can satisfy it: a lead converts only on an executed governing
 * customer agreement (`governing-agreement.ts`), so a service agreement
 * labelled "customer conversion" gated nothing while claiming to.
 *
 * Stored values outside this list are left exactly as they are; the editor
 * shows them as unsupported and a save asks for a supported gate.
 */
export const CONTRACT_LIFECYCLE_GATES = [
  {
    key: 'LEAD_TO_CUSTOMER',
    label: 'Lead to customer conversion',
    contractTypes: [...GOVERNING_CUSTOMER_AGREEMENT_TYPES],
  },
  {
    key: 'TENANT_PROVISIONING',
    label: 'Tenant provisioning service order',
    contractTypes: [ContractType.SERVICE_AGREEMENT],
  },
  {
    key: 'PARTNER_ONBOARDING',
    label: 'Partner onboarding',
    contractTypes: [
      ContractType.PARTNER_AGREEMENT,
      ContractType.MASTER_PARTNER_AGREEMENT,
    ],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  contractTypes: ContractType[];
}>;

export type ContractLifecycleGateKey =
  (typeof CONTRACT_LIFECYCLE_GATES)[number]['key'];

/**
 * Resolve a requested gate for a template of `contractType`.
 *
 * `undefined` means "not part of this request" and keeps whatever is stored;
 * an empty string clears the gate. Anything else must be a supported key for
 * this agreement type.
 */
export function resolveTemplateLifecycleGate(
  requested: string | null | undefined,
  contractType: ContractType,
): string | null | undefined {
  if (requested === undefined) return undefined;
  const key = (requested ?? '').trim();
  if (!key) return null;
  const gate = CONTRACT_LIFECYCLE_GATES.find((item) => item.key === key);
  if (!gate)
    throw new BadRequestException({
      code: 'CONTRACT_TEMPLATE_GATE_INVALID',
      message: `"${key}" is not a supported lifecycle gate. Choose one of: ${CONTRACT_LIFECYCLE_GATES.map((item) => item.label).join(', ')}.`,
    });
  if (!(gate.contractTypes as readonly ContractType[]).includes(contractType))
    throw new BadRequestException({
      code: 'CONTRACT_TEMPLATE_GATE_INVALID',
      message: `${gate.label} cannot be served by a ${contractType.replaceAll('_', ' ').toLowerCase()} template.`,
    });
  return gate.key;
}

/**
 * Who signs an agreement drafted from a template.
 *
 * The editor stored whatever was typed ("Authorized signatory") into
 * `partyDefinitions` and `signingConfig`, and nothing read either: every
 * agreement got the same default parties whatever the template said. These
 * are the two signers the signing flow can actually fill — the slots of
 * `signature-tokens.ts` — and agreement creation now applies them.
 */
export const TEMPLATE_SIGNER_ROLES = [
  {
    key: 'COUNTERPARTY_SIGNATORY',
    label: 'Customer / partner authorized signatory',
    side: 'COUNTERPARTY',
    role: ContractPartyRole.AUTHORIZED_SIGNATORY,
  },
  {
    key: 'PLATFORM_SIGNATORY',
    label: 'DijiPeople authorized signatory',
    side: 'PLATFORM',
    role: ContractPartyRole.PROVIDER,
  },
] as const;

export type TemplateSignerRoleKey =
  (typeof TEMPLATE_SIGNER_ROLES)[number]['key'];

const SIGNER_ROLE_KEYS = new Set<string>(
  TEMPLATE_SIGNER_ROLES.map((item) => item.key),
);

export type TemplateSignerPlan = {
  /** In signing order. */
  roles: TemplateSignerRoleKey[];
  mode: ContractSigningMode;
};

/** The stored shape of a validated signer plan. */
export function buildTemplateSigningDefinitions(
  requested: string[],
  mode: ContractSigningMode,
) {
  const roles = requested.map((value) => value.trim());
  if (
    !roles.length ||
    roles.some((role) => !SIGNER_ROLE_KEYS.has(role)) ||
    new Set(roles).size !== roles.length
  )
    throw new BadRequestException({
      code: 'CONTRACT_TEMPLATE_SIGNER_ROLES_INVALID',
      message: `Choose one or more signer roles, each once: ${TEMPLATE_SIGNER_ROLES.map((item) => item.label).join(', ')}.`,
    });
  const parallel = mode === ContractSigningMode.PARALLEL;
  return {
    signingConfig: { mode, requiredSignerRoles: roles },
    partyDefinitions: roles.map((key, index) => {
      const definition = TEMPLATE_SIGNER_ROLES.find(
        (item) => item.key === key,
      )!;
      return {
        key,
        partyType: definition.side,
        role: definition.role,
        signingOrder: parallel ? 1 : index + 1,
        required: true,
      };
    }),
  };
}

/**
 * The signer plan a template version declares, or null for a version saved
 * before roles were structured (free text, or the seed's party list). Null
 * keeps agreement creation on its long-standing defaults, so no existing
 * template starts demanding a DijiPeople signature it never asked for.
 */
export function readTemplateSignerPlan(
  signingConfig: unknown,
): TemplateSignerPlan | null {
  if (!signingConfig || typeof signingConfig !== 'object') return null;
  const config = signingConfig as Record<string, unknown>;
  const roles = config.requiredSignerRoles;
  if (
    !Array.isArray(roles) ||
    !roles.length ||
    !roles.every(
      (role) => typeof role === 'string' && SIGNER_ROLE_KEYS.has(role),
    )
  )
    return null;
  const mode = Object.values(ContractSigningMode).includes(
    config.mode as ContractSigningMode,
  )
    ? (config.mode as ContractSigningMode)
    : ContractSigningMode.SEQUENTIAL;
  return { roles: roles as TemplateSignerRoleKey[], mode };
}

export type DocumentContentIssue = {
  code:
    | 'LINKED_PLACEHOLDER'
    | 'MALFORMED_PLACEHOLDER'
    | 'UNKNOWN_PLACEHOLDER'
    | 'CONFIRMATION_NOTE'
    | 'DRAFT_MARKER'
    | 'DUPLICATE_CLAUSE'
    | 'REPEATED_VALUE'
    | 'HARDCODED_VALUE'
    | 'BROKEN_CROSS_REFERENCE';
  /**
   * `error` blocks publishing a template. `issue` blocks sending an agreement
   * for signature — a fill-in note may sit in a template, but never in a
   * document someone signs. `warning` is reported and never blocks, because
   * it may be a deliberate, negotiated term.
   */
  severity: 'error' | 'issue' | 'warning';
  message: string;
  samples: string[];
};

const CONFIRMATION_NOTE =
  /\[(?:\s*(?:REQUIRED|TBD|TBC|TO BE CONFIRMED|CONFIRM|INSERT|PLACEHOLDER|AUTOMATICALLY POPULATE)\b)[^\]]{0,240}\]/gi;
/*
 * Deliberately narrow and case-sensitive where the words are ordinary legal
 * English: "subject to completion of the onboarding steps" is a real term,
 * "Status: Draft — Subject to Completion and Legal Review" is an authoring note.
 */
const DRAFT_MARKERS = [
  /\bStatus:\s*Draft\b[^\n]{0,80}/g,
  /\bSubject to Completion and Legal Review\b/g,
  /\bmust be resolved[^\n.]{0,120}before signature[^\n.]*/gi,
];

function documentText(html: string) {
  return html
    .replace(/<\/(p|h[1-6]|li|tr|td|th|div|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function unique(values: string[], limit = 5) {
  return [...new Set(values.map((value) => value.trim()))].slice(0, limit);
}

/**
 * Report what is wrong with a document's content without changing it.
 *
 * Negotiated legal text is never rewritten here: every finding names what was
 * found and leaves the decision to the author. `isKnownKey` is the placeholder
 * registry, passed in so this module does not depend on the service.
 */
export function assessDocumentContent(
  html: string,
  isKnownKey: (key: string) => boolean,
): DocumentContentIssue[] {
  const issues: DocumentContentIssue[] = [];
  const push = (
    code: DocumentContentIssue['code'],
    severity: DocumentContentIssue['severity'],
    message: string,
    samples: string[],
  ) => {
    if (samples.length) issues.push({ code, severity, message, samples });
  };

  const linked = countPlaceholderMarkup(html);
  if (linked)
    push(
      'LINKED_PLACEHOLDER',
      'warning',
      `${linked} placeholder${linked === 1 ? ' carries' : 's carry'} link or formatting markup inside the braces. They render correctly and are stored clean on the next save.`,
      [String(linked)],
    );

  const text = documentText(unwrapPlaceholderMarkup(html));
  const tokens = [...text.matchAll(/\{\{([^{}]{0,160})\}\}/g)];
  const malformed: string[] = [];
  const unknown: string[] = [];
  for (const [token, inner] of tokens) {
    const key = inner.trim();
    if (!/^[a-zA-Z0-9_.-]+$/.test(key)) malformed.push(token);
    else if (key.startsWith('signature.')) {
      if (!parseSignatureTokenKey(key)) unknown.push(key);
    } else if (!isKnownKey(key)) unknown.push(key);
  }
  const withoutTokens = text.replace(/\{\{[^{}]{0,160}\}\}/g, '');
  for (const match of withoutTokens.matchAll(/.{0,30}(\{\{|\}\}).{0,30}/g))
    malformed.push(match[0]);
  for (const match of withoutTokens.matchAll(
    /(?<!\{)\{\s*[a-z]+(?:\.[a-zA-Z0-9_]+)+\s*\}(?!\})/g,
  ))
    malformed.push(match[0]);
  push(
    'MALFORMED_PLACEHOLDER',
    'error',
    'Some placeholders are malformed and can never resolve. Use the exact form {{namespace.field}}.',
    unique(malformed),
  );
  push(
    'UNKNOWN_PLACEHOLDER',
    'error',
    'Some placeholders are not defined, so no record can fill them. Replace them with a defined field.',
    unique(unknown, 20),
  );

  push(
    'CONFIRMATION_NOTE',
    'issue',
    'The document still contains fill-in or confirmation notes. Replace each with the agreed term or a placeholder before it is sent for signature.',
    unique(
      [...text.matchAll(CONFIRMATION_NOTE)].map((match) => match[0]),
      50,
    ),
  );
  push(
    'DRAFT_MARKER',
    'issue',
    'The document describes itself as a draft or as incomplete. Remove that wording before it is sent for signature.',
    unique(
      DRAFT_MARKERS.flatMap((pattern) =>
        [...text.matchAll(pattern)].map((match) => match[0]),
      ),
    ),
  );

  const paragraphs = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 60);
  const seen = new Map<string, number>();
  for (const paragraph of paragraphs) {
    const normalized = paragraph.toLowerCase().replace(/^[\w.()]+\s+/, '');
    seen.set(normalized, (seen.get(normalized) ?? 0) + 1);
  }
  push(
    'DUPLICATE_CLAUSE',
    'warning',
    'The same clause text appears more than once.',
    unique(
      [...seen.entries()]
        .filter(([, count]) => count > 1)
        .map(([paragraph]) => paragraph.slice(0, 120)),
    ),
  );

  const counts = new Map<string, number>();
  for (const [, inner] of tokens) {
    const key = inner.trim();
    if (/^(commercial|contract)\.(?!number$)/.test(key))
      counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  push(
    'REPEATED_VALUE',
    'warning',
    'Commercial values are restated in several places. Each instance resolves from the same record, but consider stating each term once.',
    [...counts.entries()]
      .filter(([, count]) => count >= 3)
      .map(([key, count]) => `${key} ×${count}`),
  );

  const hardcoded = [
    ...[
      ...withoutTokens.matchAll(
        /\b(?:[A-Z]{3}|Rs\.?|\$|€|£)\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g,
      ),
    ].map((match) => match[0]),
    ...[
      ...withoutTokens.matchAll(
        /\b(?:Agreement|Contract)\s+Version:?\s*\d+(?:\.\d+)*[^\n]{0,40}/gi,
      ),
    ].map((match) => match[0]),
  ];
  push(
    'HARDCODED_VALUE',
    'warning',
    'Fixed amounts or version numbers are written into the text. Where they vary per agreement, use a placeholder such as {{contract.liabilityCap}} or {{contract.version}}.',
    unique(hardcoded),
  );

  const clauseNumbers = new Set(
    text
      .split('\n')
      .map((line) => line.trim().match(/^(\d+(?:\.\d+)*)[.\s]/)?.[1])
      .filter((value): value is string => Boolean(value)),
  );
  const schedules = new Set(
    [...text.matchAll(/^\s*SCHEDULE\s+([A-Z0-9]+)\b/gim)].map((match) =>
      match[1].toUpperCase(),
    ),
  );
  const brokenReferences = [
    ...[...text.matchAll(/\bClauses?\s+(\d+(?:\.\d+)*)/g)]
      .filter((match) => clauseNumbers.size && !clauseNumbers.has(match[1]))
      .map((match) => match[0]),
    ...[...text.matchAll(/\bSchedule\s+([A-Z])\b/g)]
      .filter((match) => schedules.size && !schedules.has(match[1]))
      .map((match) => match[0]),
  ];
  push(
    'BROKEN_CROSS_REFERENCE',
    'warning',
    'Some cross-references point at a clause or schedule the document does not contain.',
    unique(brokenReferences),
  );

  return issues;
}

/** Throws when any issue of the given severities is present. */
export function assertDocumentContent(
  issues: DocumentContentIssue[],
  blocking: DocumentContentIssue['severity'][],
  action: string,
) {
  const blockers = issues.filter((issue) => blocking.includes(issue.severity));
  if (!blockers.length) return;
  throw new BadRequestException({
    code: 'CONTRACT_DOCUMENT_CONTENT_INVALID',
    message: `Fix the document before ${action}: ${blockers
      .map(
        (issue) =>
          `${issue.message} (${issue.samples.slice(0, 5).join('; ')}${issue.samples.length > 5 ? '; …' : ''})`,
      )
      .join(' ')}`,
    details: { issues: blockers },
  });
}
