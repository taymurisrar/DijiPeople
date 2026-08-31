import { shouldSendSignedInVisitorToWorkspace } from "./proxy";

/**
 * The /login bounce, which used to turn one dead session into a browser error.
 *
 * BUG-2662 / REG-388. The middleware sends a visitor who already carries
 * session cookies from /login on to their workspace. But it only ever checked
 * that the cookies *exist* — it cannot see that the API has revoked the session
 * behind them, and it does not always try, because an access token stays
 * structurally valid for hours after the server-side session row is gone.
 *
 * So: the protected page's fetch 401s and redirects to /login, this rule sees
 * the same stale cookies and sends it back to /, that 401s too. The browser
 * gives up with ERR_TOO_MANY_REDIRECTS and the only escape a user has is
 * clearing cookies, which they will not find. Reproduced twice against
 * production, on the commit *before* the reporting release — it is not that
 * release's doing.
 *
 * A `next` or `reason` parameter is positive evidence that an earlier hop
 * already decided this session does not work, and it is what breaks the cycle.
 */

const params = (query: string) => new URLSearchParams(query);

describe("shouldSendSignedInVisitorToWorkspace", () => {
  it("sends a genuinely signed-in visitor to their workspace", () => {
    // Someone who typed /login while their session works. The whole point of
    // the rule; it must survive the fix.
    expect(shouldSendSignedInVisitorToWorkspace(true, params(""))).toBe(true);
  });

  it("leaves a visitor with no cookies on the login form", () => {
    expect(shouldSendSignedInVisitorToWorkspace(false, params(""))).toBe(false);
    expect(
      shouldSendSignedInVisitorToWorkspace(false, params("next=%2Freports")),
    ).toBe(false);
  });

  it("does not bounce when an earlier hop sent us here with next", () => {
    // This is the loop. Cookies are present and useless.
    expect(
      shouldSendSignedInVisitorToWorkspace(true, params("next=%2Freports")),
    ).toBe(false);
  });

  it("does not bounce when the logout route sent us here with a reason", () => {
    expect(
      shouldSendSignedInVisitorToWorkspace(
        true,
        params("reason=session-expired"),
      ),
    ).toBe(false);
  });

  it("does not bounce on the exact chain that produced the loop", () => {
    /*
     * Every hop of the observed cycle, asserted as a sequence rather than as
     * one case: /reports 401s -> /login?next=/reports -> / -> 401 ->
     * /login?next=/ -> ... Each arrival at /login carries `next`, so each one
     * must now render the form instead of bouncing.
     */
    const hops = ["next=%2Freports", "next=%2F", "next=%2Freports%3Ftab%3D1"];
    for (const hop of hops) {
      expect(shouldSendSignedInVisitorToWorkspace(true, params(hop))).toBe(
        false,
      );
    }
  });

  it("treats an empty next as evidence too", () => {
    // `?next=` with no value still means somebody redirected us here.
    expect(shouldSendSignedInVisitorToWorkspace(true, params("next="))).toBe(
      false,
    );
  });
});
