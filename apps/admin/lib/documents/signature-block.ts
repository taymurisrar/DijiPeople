/**
 * The markup one signature box inserts into a contract template.
 *
 * Kept out of the editor component on purpose. What this produces has to
 * survive `cleanContractHtml` on the API, has to print, and has to leave no
 * token behind that nothing will ever resolve — three claims worth asserting,
 * and none of them assertable from inside a file that imports TipTap.
 */

/**
 * The lines a signature box can carry, in the order a contract prints them.
 *
 * `token` says where the value comes from once the agreement is signed, and a
 * null one means the line is ruled and left for the signer. Title and Company
 * are deliberately blank for every party: the platform holds no placeholder for
 * either, and printing an unresolvable `{{...}}` into an executed agreement is
 * worse than printing an empty line somebody fills in.
 */
export const SIGNATURE_LINES = [
  { key: "signature", label: "Signature", token: "signature" },
  { key: "name", label: "Printed name", token: "partyName" },
  { key: "title", label: "Title", token: null },
  { key: "company", label: "Company", token: null },
  { key: "date", label: "Date", token: "date" },
] as const;

export type SignatureLineKey = (typeof SIGNATURE_LINES)[number]["key"];

/** A party a signature box can be addressed to. */
export type SignatureParty = {
  /**
   * The namespace under `signature.*` that the signing flow writes into, or
   * null for a party that signs on paper.
   */
  slot: string | null;
  label: string;
};

export const WET_INK_PARTY: SignatureParty = {
  slot: null,
  label: "Another party (signs by hand)",
};

function escapeDocumentText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Build the block.
 *
 * A **table**, not a custom element, and that is a constraint rather than a
 * preference: `cleanContractHtml` on the API allows `table`/`tr`/`th`/`td` and
 * strips `div` along with any `data-signature-*` attribute, so a bespoke node
 * would be silently deleted the first time the template was saved — the author
 * would place a signature box, save, and find it gone with no error anywhere.
 * `data-document-role` is the one hook that is allowed through, and the editor
 * and print stylesheets both key off it.
 *
 * A table also survives the DOCX and print paths that already exist, and —
 * because it is ordinary editor content once inserted — the author can retype a
 * caption or delete a row afterwards without reopening the inserter.
 */
export function buildSignatureBlockHtml(
  party: SignatureParty,
  caption: string,
  lines: readonly SignatureLineKey[],
  partyNameToken: string | null,
  /*
   * The signer's role ("Authorized signatory", "Witness"), printed on the
   * Title line. Plain text, not a token: no record holds a per-agreement
   * signer title for every party, and the role is what the template author
   * knows when the block is placed.
   */
  signerRole = "",
) {
  const role = signerRole.trim();
  const cells = SIGNATURE_LINES.filter((line) => lines.includes(line.key)).map(
    (line) => {
      let value = "";
      if (party.slot && line.token === "signature")
        value = `{{signature.${party.slot}.name}}`;
      else if (party.slot && line.token === "date")
        value = `{{signature.${party.slot}.date}}`;
      else if (line.token === "partyName" && partyNameToken)
        value = `{{${partyNameToken}}}`;
      else if (line.key === "title" && role) value = escapeDocumentText(role);
      /* A ruled, empty cell — never a token nothing will ever resolve. */
      return `<tr><td><strong>${escapeDocumentText(line.label)}</strong></td><td>${value || "&nbsp;"}</td></tr>`;
    },
  );
  /*
   * The caption falls back to the party's own name, and only for a party the
   * platform cannot sign for. A wet-ink block with no caption is an anonymous
   * set of ruled lines — whoever holds the paper cannot tell the witness's
   * block from the guarantor's. A registry party needs no such fallback: its
   * label ("Counterparty signature") is a picker entry, not a heading, and its
   * lines carry resolvable tokens that say whose they are.
   */
  const heading = caption.trim() || (party.slot ? "" : party.label.trim());
  const header = heading
    ? `<tr><th colspan="2">${escapeDocumentText(heading)}</th></tr>`
    : "";
  return `<table data-document-role="signature-block"><tbody>${header}${cells.join("")}</tbody></table><p></p>`;
}

/** A placeholder definition as the API serves it — only what this file reads. */
export type RegistryPlaceholder = {
  key: string;
  label: string;
  deprecatedFor?: string;
};

/**
 * Whether a document token is a signature field.
 *
 * By namespace, the same rule the API applies (`isSignaturePlaceholderKey`):
 * every `signature.*` token is filled at signing, never typed in, so the
 * editor shows it as a signature and never offers it as an ordinary field.
 */
export function isSignatureTokenKey(key: string) {
  return key.trim().startsWith("signature.");
}

/**
 * The parties a signature box can be addressed to.
 *
 * Read out of the API placeholder registry rather than listed here, so a slot
 * registered on the API (`signature.<slot>.name`) appears without a second
 * registration in the frontend — that duplication is exactly how the two
 * placeholder lists drifted apart before. Wet ink is always last.
 */
export function signaturePartiesFromRegistry(
  definitions: readonly RegistryPlaceholder[],
): SignatureParty[] {
  const slots = new Map<string, string>();
  for (const definition of definitions) {
    if (definition.deprecatedFor) continue;
    const match = /^signature\.(.+)\.name$/.exec(definition.key);
    if (!match?.[1]) continue;
    slots.set(match[1], definition.label || match[1]);
  }
  return [
    ...[...slots.entries()].map(([slot, label]) => ({ slot, label })),
    WET_INK_PARTY,
  ];
}

/**
 * The token that prints the party's *name* beneath the mark.
 *
 * `signature.<slot>.name` is the mark itself — an image when the signer drew
 * one — so it cannot also serve as the printed name. The party's own entity
 * token is used where the registry offers one (`platform.legalName`,
 * `counterparty.name`), and the line is left ruled where it does not.
 */
export function signaturePartyNameToken(
  party: SignatureParty,
  definitions: readonly RegistryPlaceholder[],
) {
  if (!party.slot) return null;
  return (
    [`${party.slot}.legalName`, `${party.slot}.name`].find((candidate) =>
      definitions.some(
        (definition) =>
          definition.key === candidate && !definition.deprecatedFor,
      ),
    ) ?? null
  );
}
