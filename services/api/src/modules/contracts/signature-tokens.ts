/**
 * The one representation of a signature field in an agreement document.
 *
 * A signature field is the token `{{signature.<slot>.<field>}}`:
 *
 *   - `<slot>` names *whose* signature it is. The signing flow fills a slot
 *     from the evidence of exactly one signer (`renderSignatureEvidenceTokens`),
 *     so the slot list here is the list of parties the platform can sign for.
 *   - `<field>` is what of that signature is printed: the mark itself (`name` —
 *     an image when the signer drew one, the styled typed name otherwise), the
 *     signing `date`, or the counterparty's `initials`.
 *
 * Every stage reads the same token — the editor inserts it, the template
 * stores it, generation freezes around it, signing fills it, and the executed
 * copy renders it — which is why this module exists: before it, the editor
 * offered the raw tokens as ordinary text fields beside a separate signature
 * box, and operator-typed variants (`{{ signature.partner.name }}`,
 * `{{signature.platform.signature}}`) fell through to the executed-copy
 * renderer's round-robin fallback for unknown slots, which could print one
 * party's signature in another party's block.
 *
 * Normalising is a read-and-write compatibility layer, not a migration: stored
 * templates are never rewritten in place. `cleanContractHtml` normalises what
 * is saved from now on, and every renderer normalises what it reads, so a
 * template authored against an older spelling keeps rendering — into the
 * right party's block — without a data change.
 */

/** Parties the platform can capture an electronic signature for. */
export const SIGNATURE_SLOTS = [
  'platform',
  'counterparty',
  'party.primary',
] as const;

export type SignatureSlot = (typeof SIGNATURE_SLOTS)[number];

export const SIGNATURE_FIELDS = ['name', 'date', 'initials'] as const;

export type SignatureField = (typeof SIGNATURE_FIELDS)[number];

/*
 * Spellings of a slot that name the same party. The counterparty aliases are
 * the subject entities an agreement can be signed with (ADR-0020); in every
 * one of them the subject *is* the party opposite the platform, which is what
 * the `counterparty` slot resolves to.
 */
const SLOT_ALIASES: Record<string, SignatureSlot> = {
  platform: 'platform',
  dijipeople: 'platform',
  provider: 'platform',
  counterparty: 'counterparty',
  partner: 'counterparty',
  customer: 'counterparty',
  lead: 'counterparty',
  tenant: 'counterparty',
  client: 'counterparty',
  'party.primary': 'party.primary',
  primary: 'party.primary',
};

const FIELD_ALIASES: Record<string, SignatureField> = {
  name: 'name',
  signature: 'name',
  mark: 'name',
  date: 'date',
  signedat: 'date',
  signeddate: 'date',
  signed_at: 'date',
  initials: 'initials',
};

export type SignatureToken = {
  /** The canonical key, e.g. `signature.counterparty.date`. */
  key: string;
  slot: SignatureSlot;
  field: SignatureField;
};

/**
 * Parse a placeholder key into a canonical signature token, or null when it is
 * not one the platform can fill. Null is deliberate for an unknown slot
 * (`signature.witness.name`): a party nobody signs for electronically is a
 * wet-ink line, and mapping it onto a real slot would print a real signer's
 * mark in somebody else's block. Such a token is left exactly as written.
 */
export function parseSignatureTokenKey(rawKey: string): SignatureToken | null {
  const parts = rawKey.trim().split('.');
  if (parts.length < 3 || parts[0] !== 'signature') return null;
  const field = FIELD_ALIASES[parts[parts.length - 1].toLowerCase()];
  const slot = SLOT_ALIASES[parts.slice(1, -1).join('.').toLowerCase()];
  if (!field || !slot) return null;
  // Initials exist for the counterparty only; the signing flow writes no
  // other party's initials, so any other spelling is not a token it can fill.
  if (field === 'initials' && slot !== 'counterparty') return null;
  return { key: `signature.${slot}.${field}`, slot, field };
}

const SIGNATURE_TOKEN_PATTERN = /\{\{\s*(signature\.[a-zA-Z0-9_.-]+)\s*\}\}/g;

/**
 * Rewrite every recognised signature token to its canonical spelling. Tokens
 * that do not parse are left exactly as written, so nothing an author typed
 * disappears.
 */
export function normalizeSignatureTokens(html: string) {
  return html.replace(SIGNATURE_TOKEN_PATTERN, (token, key: string) => {
    const parsed = parseSignatureTokenKey(key);
    return parsed ? `{{${parsed.key}}}` : token;
  });
}
