/*
 * Client copy of `services/api/src/modules/contracts/placeholder-markup.ts`.
 *
 * The editor used to auto-link placeholder keys, storing
 * `{{<a href="http://customer.contact.email">customer.contact.email</a>}}`.
 * The API renders those correctly and stores them clean on save; this lets
 * the editor and its sample preview show the same clean token when such a
 * version is opened, instead of a link the preview cannot substitute.
 */
const INLINE_TAG = /<\/?(?:a|span|strong|b|em|i|u|s|mark|code)\b[^>]*>/gi;

export function unwrapPlaceholderMarkup(html: string) {
  return html.replace(
    /\{\{((?:[^{}<]|<[^>]*>){1,600}?)\}\}/g,
    (token, inner: string) => {
      if (!inner.includes("<")) return token;
      const stripped = inner.replace(INLINE_TAG, "");
      if (stripped.includes("<")) return token;
      const key = stripped.trim();
      return /^[a-zA-Z0-9_.-]+$/.test(key) ? `{{${key}}}` : token;
    },
  );
}
