import {
  NotificationRequestError,
  isAuthFailure,
} from "@/lib/notifications-api";

/**
 * BUG-2459 — the notification pollers ran forever after the session ended.
 *
 * `NotificationBell` and `NotificationPopupProvider` each poll every 60
 * seconds. Neither stopped on a `401`, so a tab left open after a sign-out kept
 * asking twice a minute indefinitely, and every refusal was written to the
 * production error log as an incident. Two fingerprints carried 1,033
 * occurrences between them.
 *
 * The fix has two halves. The components check `isAuthFailure` and clear their
 * interval; that half needs a mounted component, and `apps/web` has no jsdom or
 * testing-library, so it is not covered here — the gap is stated in the record
 * rather than papered over with a source-text assertion that would pass after
 * the behaviour was deleted.
 *
 * What *is* covered is the half both components stand on: the request layer
 * has to distinguish a `401` from any other failure at all. It previously threw
 * a bare `Error` carrying only a message, which is precisely why neither
 * component could tell "try again next tick" from "there is nothing to try
 * again for". If that regresses, both fixes silently stop working and no
 * component test would catch it either.
 */
describe("BUG-2459 — a failed notification request carries its status", () => {
  it("recognises a 401 as the end of the session", () => {
    const error = new NotificationRequestError(
      "Session is no longer active.",
      401,
    );

    expect(error.status).toBe(401);
    expect(error.isAuthFailure).toBe(true);
    expect(isAuthFailure(error)).toBe(true);
  });

  it.each([400, 403, 404, 429, 500, 502, 503])(
    "does not treat a %s as the end of the session",
    (status) => {
      /*
       * The negative cases are the ones that matter. Stopping the poll on a
       * transient 500 or a 503 would leave a live session permanently without
       * notifications until the page was reloaded — trading a noisy bug for a
       * silent one.
       */
      const error = new NotificationRequestError("Request failed.", status);

      expect(error.isAuthFailure).toBe(false);
      expect(isAuthFailure(error)).toBe(false);
    },
  );

  it("does not mistake an ordinary error for an auth failure", () => {
    // A network drop rejects with a plain TypeError, not our error type.
    expect(isAuthFailure(new Error("Failed to fetch"))).toBe(false);
    expect(isAuthFailure(new TypeError("Failed to fetch"))).toBe(false);
    expect(isAuthFailure(null)).toBe(false);
    expect(isAuthFailure(undefined)).toBe(false);
    expect(isAuthFailure({ status: 401 })).toBe(false);
  });

  it("stays an Error, so existing catch blocks keep working", () => {
    /*
     * Several callers still read `requestError.message` after checking
     * `instanceof Error`. Widening the thrown type must not narrow what those
     * callers see.
     */
    const error = new NotificationRequestError("Session has expired.", 401);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Session has expired.");
    expect(error.name).toBe("NotificationRequestError");
  });
});
