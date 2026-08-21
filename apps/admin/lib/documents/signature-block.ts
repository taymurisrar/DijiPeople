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
) {
  const cells = SIGNATURE_LINES.filter((line) => lines.includes(line.key)).map(
    (line) => {
      let value = "";
      if (party.slot && line.token === "signature")
        value = `{{signature.${party.slot}.name}}`;
      else if (party.slot && line.token === "date")
        value = `{{signature.${party.slot}.date}}`;
      else if (line.token === "partyName" && partyNameToken)
        value = `{{${partyNameToken}}}`;
      /* A ruled, empty cell — never a token nothing will ever resolve. */
      return `<tr><td><strong>${escapeDocumentText(line.label)}</strong></td><td>${value || "&nbsp;"}</td></tr>`;
    },
  );
  const header = caption.trim()
    ? `<tr><th colspan="2">${escapeDocumentText(caption.trim())}</th></tr>`
    : "";
  return `<table data-document-role="signature-block"><tbody>${header}${cells.join("")}</tbody></table><p></p>`;
}
