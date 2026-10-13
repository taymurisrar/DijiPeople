/**
 * Signature blocks for every required signer, not only the ones a template
 * names.
 *
 * A template carries a fixed number of signature slots — normally one for
 * DijiPeople (`signature.platform.*`) and one for the party opposite it
 * (`signature.counterparty.*`). An agreement can have more signers than that:
 * a customer that signs through two officers, or a second provider signatory.
 * Before this module the executed copy of CON-20261012-E7421CC1 carried three
 * signers in its evidence appendix but only two signature blocks, because the
 * third signer had no slot to fill.
 *
 * The fix is to compute, at render time, which signer each template slot
 * resolves to and to generate one block for every signer left over, placed
 * directly after the template's own signature section. It is render-time on
 * purpose: the frozen signing version is never rewritten, so an executed
 * agreement's stored content and hash stay exactly as signed, while every
 * later rendering — preview, signing page, regenerated copy — shows every
 * signer. The generated block uses a per-signer token
 * (`{{signature.signer.<key>.name}}`) that the executed-copy renderer resolves
 * to that one signer's evidence and nobody else's.
 */

import {
  normalizeSignatureTokens,
  parseSignatureTokenKey,
} from './signature-tokens';

/** Token slot prefix of a generated, per-signer signature block. */
export const SIGNER_SLOT_PREFIX = 'signer.';

export type SignatoryForBlock = {
  /** Stable id used in the block's token: an evidence, recipient or party id. */
  key: string;
  partyType?: string | null;
  isPrimary?: boolean | null;
  signingOrder?: number | null;
  /** The person who signs. */
  name: string;
  /** The contracting party the person signs for. */
  organization?: string | null;
  email?: string | null;
};

type SlotSubject = Pick<
  SignatoryForBlock,
  'partyType' | 'isPrimary' | 'signingOrder'
>;

/**
 * Which signer each template slot resolves to. Preview, signing page and
 * executed copy all call this, so a slot cannot name one person in the
 * preview and another in the signed PDF.
 *
 * - `platform`: the first DijiPeople signer by signing order.
 * - `counterparty` / `party.primary`: the primary party's signer opposite
 *   DijiPeople, else the first one by signing order. `counterparty` used to
 *   take whichever counterparty *signed* first, so in a parallel request a
 *   secondary signer could land in the block the template captions with the
 *   primary signer's name.
 */
export function assignSignatureSlots<T extends SlotSubject>(signers: T[]) {
  const ordered = signers
    .map((signer, index) => ({ signer, index }))
    .sort(
      (left, right) =>
        (left.signer.signingOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.signer.signingOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.index - right.index,
    )
    .map((item) => item.signer);
  const counterparties = ordered.filter(
    (signer) => signer.partyType !== 'PLATFORM',
  );
  const primary =
    counterparties.find((signer) => signer.isPrimary) ?? counterparties[0];
  const slots: Record<string, T | undefined> = {
    platform: ordered.find((signer) => signer.partyType === 'PLATFORM'),
    counterparty: primary,
    'party.primary': primary,
  };
  return { ordered, slots };
}

const SIGNATURE_TOKEN_PATTERN = /\{\{\s*(signature\.[a-zA-Z0-9_.-]+)\s*\}\}/g;

const PARTY_CAPTIONS: Record<string, string> = {
  PLATFORM: 'FOR THE SERVICE PROVIDER',
  CUSTOMER: 'FOR THE CUSTOMER',
  TENANT: 'FOR THE CUSTOMER',
  PARTNER: 'FOR THE PARTNER',
  LEAD: 'FOR THE CUSTOMER',
};

function partyCaption(partyType: string | null | undefined) {
  if (!partyType) return 'FOR THE COUNTERPARTY';
  return (
    PARTY_CAPTIONS[partyType] ??
    `FOR THE ${partyType.replaceAll('_', ' ').toUpperCase()}`
  );
}

/*
 * Braces are escaped as well as markup: a party called `{{contract.number}}`
 * must print as written, not be substituted by the placeholder renderer that
 * runs over this HTML next.
 */
function escapeBlockText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

function signatureBlockHtml(signer: SignatoryForBlock, ordinal: number) {
  const caption = `${partyCaption(signer.partyType)}${ordinal > 1 ? ` — AUTHORIZED SIGNATORY ${ordinal}` : ''}`;
  const details = [
    signer.organization
      ? `Legal Contracting Party: ${escapeBlockText(signer.organization)}`
      : '',
    `Authorized Signatory: ${escapeBlockText(signer.name)}`,
    signer.email ? `Email: ${escapeBlockText(signer.email)}` : '',
  ].filter(Boolean);
  const token = `signature.${SIGNER_SLOT_PREFIX}${signer.key}`;
  return [
    `<p data-document-role="additional-signature"><strong>${caption}</strong></p>`,
    `<p>${details.join('<br>')}</p>`,
    `<p>Signature: {{${token}.name}}</p>`,
    `<p>Date: {{${token}.date}}</p>`,
  ].join('');
}

/*
 * Directly after the element holding the template's last signature token, so
 * generated blocks continue the template's own signature section rather than
 * landing after the schedules. A token inside a table (a side-by-side layout)
 * places them after that table.
 */
function insertionPoint(html: string, lastTokenIndex: number) {
  const tableOpen = html.lastIndexOf('<table', lastTokenIndex);
  const tableClose = html.lastIndexOf('</table>', lastTokenIndex);
  if (tableOpen > tableClose) {
    const end = html.indexOf('</table>', lastTokenIndex);
    if (end >= 0) return end + '</table>'.length;
  }
  const paragraphEnd = html.indexOf('</p>', lastTokenIndex);
  return paragraphEnd >= 0 ? paragraphEnd + '</p>'.length : html.length;
}

/**
 * Add a signature block for every signer that no template slot resolves to.
 *
 * A document without any recognised signature token is returned unchanged:
 * such a template has no signature section to extend, and its signers are
 * still listed in the evidence appendix.
 */
export function insertAdditionalSignatureBlocks(
  html: string,
  signers: SignatoryForBlock[],
) {
  const normalized = normalizeSignatureTokens(html);
  if (!signers.length) return normalized;
  const usedSlots = new Set<string>();
  let lastTokenIndex = -1;
  for (const match of normalized.matchAll(SIGNATURE_TOKEN_PATTERN)) {
    const parsed = parseSignatureTokenKey(match[1]);
    if (!parsed) continue;
    usedSlots.add(parsed.slot);
    lastTokenIndex = match.index ?? lastTokenIndex;
  }
  if (lastTokenIndex < 0) return normalized;
  const { ordered, slots } = assignSignatureSlots(signers);
  const covered = new Set(
    [...usedSlots]
      .map((slot) => slots[slot])
      .filter((signer): signer is SignatoryForBlock => Boolean(signer)),
  );
  const extras = ordered.filter(
    (signer) =>
      !covered.has(signer) &&
      !normalized.includes(`{{signature.${SIGNER_SLOT_PREFIX}${signer.key}.`),
  );
  if (!extras.length) return normalized;
  // Numbered within the party: the template's own block is signatory 1.
  const ordinals = new Map<SignatoryForBlock, number>();
  const counts = new Map<string, number>();
  for (const signer of ordered) {
    const side = partyCaption(signer.partyType);
    const next = (counts.get(side) ?? 0) + 1;
    counts.set(side, next);
    ordinals.set(signer, next);
  }
  const at = insertionPoint(normalized, lastTokenIndex);
  return `${normalized.slice(0, at)}${extras
    .map((signer) => signatureBlockHtml(signer, ordinals.get(signer) ?? 1))
    .join('')}${normalized.slice(at)}`;
}

/**
 * The contracting party a signer signs for: their own party's legal name,
 * else the primary party of the same type (a second officer signing for the
 * customer signs for the customer), else their party's name.
 */
export function signerOrganization(
  party:
    | {
        partyType?: string | null;
        name?: string | null;
        legalName?: string | null;
      }
    | null
    | undefined,
  parties: ReadonlyArray<{
    partyType?: string | null;
    name?: string | null;
    legalName?: string | null;
    isPrimary?: boolean | null;
  }>,
) {
  if (!party) return null;
  if (party.legalName) return party.legalName;
  const primary = parties.find(
    (item) => item.partyType === party.partyType && item.isPrimary,
  );
  return primary?.legalName || primary?.name || party.name || null;
}
