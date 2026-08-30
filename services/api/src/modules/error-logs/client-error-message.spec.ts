import {
  MAX_CLIENT_MESSAGE_LENGTH,
  looksLikeMarkupDocument,
  toStoredClientMessage,
} from './client-error-message';

/**
 * BUG-2460 — a browser could store a rendered web page as an incident title.
 *
 * When a tenant-app request hits a path the Next proxy does not serve, Next
 * answers with its own HTML 404 page. The client reporter read that body as the
 * error message and posted it; the API stored it verbatim. Thirteen incidents
 * in production carry a complete 14 KB HTML document as their `message`, and
 * the admin monitoring queue renders that field as the row title.
 */
describe('BUG-2460 — a client cannot store a web page as an incident message', () => {
  const NEXT_ERROR_PAGE =
    '<!DOCTYPE html><html lang="en" class="instrument_sans_69daf838-module__T3g6bW__variable" ' +
    'style="--brand-primary:#0f766e;--brand-surface:#ffffff">' +
    '<head><meta charSet="utf-8"/></head><body>' +
    'x'.repeat(14_000) +
    '</body></html>';

  it('replaces a markup document with what actually happened', () => {
    const stored = toStoredClientMessage(NEXT_ERROR_PAGE, 404);

    expect(stored).toBe(
      'The server returned an HTML error page (status 404) where a JSON error response was expected.',
    );
    // Replaced, not truncated: 500 bytes of doctype and inline CSS would be
    // just as useless as 14 KB of it, and would still look like garbage.
    expect(stored).not.toContain('<!DOCTYPE');
    expect(stored).not.toContain('--brand-primary');
  });

  it.each([
    ['<!doctype html><html><body>x</body></html>', 'lowercase doctype'],
    ['  \n <!DOCTYPE html>', 'leading whitespace'],
    ['<html lang="en"><body></body></html>', 'no doctype'],
    ['<?xml version="1.0"?><error/>', 'an XML fault document'],
  ])('recognises %s (%s)', (body) => {
    expect(looksLikeMarkupDocument(body)).toBe(true);
  });

  it('keeps an ordinary message exactly as sent', () => {
    const message = 'Office location is required for office attendance.';
    expect(toStoredClientMessage(message, 400)).toBe(message);
  });

  it('does not mistake a message that merely mentions a tag', () => {
    /*
     * The check is anchored at the start rather than searching anywhere in the
     * string. A validation message quoting an element is real information and
     * must survive.
     */
    const message = 'Expected <input name="email"> to be present in the form.';

    expect(looksLikeMarkupDocument(message)).toBe(false);
    expect(toStoredClientMessage(message, 500)).toBe(message);
  });

  it('bounds a long non-markup message rather than storing it whole', () => {
    const long = 'a'.repeat(5_000);
    const stored = toStoredClientMessage(long, 500);

    expect(stored.length).toBe(MAX_CLIENT_MESSAGE_LENGTH);
    expect(stored.endsWith('…')).toBe(true);
  });

  it('keeps a message of exactly the maximum length intact', () => {
    const exact = 'a'.repeat(MAX_CLIENT_MESSAGE_LENGTH);
    expect(toStoredClientMessage(exact, 500)).toBe(exact);
  });

  it.each([[null], [undefined], [''], ['   '], [42], [{}]])(
    'falls back for %p',
    (value) => {
      expect(toStoredClientMessage(value, 500)).toBe('Client error');
    },
  );
});
