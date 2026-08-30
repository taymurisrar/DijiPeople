/**
 * Bounding what a browser is allowed to put in an incident's `message`.
 *
 * The tenant app reports an error by reading the failing response. When that
 * response is not our JSON error contract — a Next.js 404 page, a CDN error
 * page, a gateway timeout page — the body is HTML, and it used to be stored
 * whole. Production holds thirteen incidents whose message is a complete 14 KB
 * HTML document: doctype, inlined CSS custom properties, script tags. The admin
 * monitoring queue renders that field as the row title (BUG-2460).
 *
 * Two consequences, and the second is the one that keeps growing: the queue
 * becomes unreadable wherever such a row lands, and each row costs ~14 KB
 * instead of ~200 bytes in a table the platform writes to on every failure.
 *
 * This lives on the server rather than only in the client reporter because
 * `POST /error-logs/client` accepts whatever any client sends. A second
 * reporting client would otherwise have to rediscover the rule, and the
 * agent-desktop app is a second reporting client.
 */

/**
 * The longest a client-reported message may be before it is truncated.
 *
 * Generous for a sentence, far below a rendered page.
 */
export const MAX_CLIENT_MESSAGE_LENGTH = 500;

/**
 * Whether a reported message is really a markup document.
 *
 * Anchored at the start rather than searching anywhere in the string: a
 * legitimate message may well quote a tag — "expected <input> to be present" —
 * and replacing that would lose real information.
 */
export function looksLikeMarkupDocument(value: string): boolean {
  return /^\s*(<!doctype\s|<html[\s>]|<\?xml[\s?])/i.test(value);
}

/**
 * A client-reported message, bounded and never a markup document.
 *
 * A markup body is *replaced* rather than truncated. Truncating it would store
 * 500 bytes of doctype and inline CSS, which tells nobody anything; the only
 * real information in such a response is the status code, and that is recorded
 * in its own column. So the row says what actually happened instead.
 */
export function toStoredClientMessage(
  value: unknown,
  statusCode: number,
): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : null;
  if (!raw) return 'Client error';

  if (looksLikeMarkupDocument(raw)) {
    return `The server returned an HTML error page (status ${statusCode}) where a JSON error response was expected.`;
  }

  if (raw.length <= MAX_CLIENT_MESSAGE_LENGTH) return raw;
  return `${raw.slice(0, MAX_CLIENT_MESSAGE_LENGTH - 1)}…`;
}
