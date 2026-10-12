/**
 * Inline formatting that an editor wrapped around part of a placeholder.
 *
 * The template editor ran TipTap's Link extension with `autolink` on, and a
 * placeholder key reads like a host name — `customer.contact.email` — so
 * typing one produced `{{<a href="http://customer.contact.email">customer.contact.email</a>}}`.
 * No renderer matches that, so the token printed raw in every preview, PDF and
 * signed copy, and a dotted key split across a link
 * (`{{<a …>customer.contact</a>.fullName}}`) was not even recognised as one
 * placeholder. Template 55b74891 version 2 carries seventeen of them.
 *
 * Like `normalizeSignatureTokens`, this is a read-and-write compatibility
 * layer, not a migration: what is saved from now on is stored clean, and every
 * renderer applies it to what it reads, so a published version keeps its
 * stored bytes and still renders correctly.
 */
const INLINE_TAG = /<\/?(?:a|span|strong|b|em|i|u|s|mark|code)\b[^>]*>/gi;

export function unwrapPlaceholderMarkup(html: string) {
  return html.replace(
    /\{\{((?:[^{}<]|<[^>]*>){1,600}?)\}\}/g,
    (token, inner: string) => {
      if (!inner.includes('<')) return token;
      const stripped = inner.replace(INLINE_TAG, '');
      // Anything other than inline formatting (a paragraph break, a table
      // cell) means the braces were never one placeholder; leave it to the
      // content check to report rather than joining two blocks into one.
      if (stripped.includes('<')) return token;
      const key = stripped.trim();
      return /^[a-zA-Z0-9_.-]+$/.test(key) ? `{{${key}}}` : token;
    },
  );
}

/** How many placeholders in `html` carry markup inside their braces. */
export function countPlaceholderMarkup(html: string) {
  let count = 0;
  html.replace(/\{\{((?:[^{}<]|<[^>]*>){1,600}?)\}\}/g, (token, inner) => {
    if (String(inner).includes('<')) count += 1;
    return token;
  });
  return count;
}
