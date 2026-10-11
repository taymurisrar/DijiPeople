import { isSessionEnded } from "./notification-model";

/**
 * BUG-3895 — the bell kept polling after sign-out.
 *
 * `apps/admin` has no jsdom, so the mounted poll loop is not covered here; this
 * pins the decision the loop stands on. If a 401 stops being recognised as the
 * end of the session, the component fix silently stops working.
 */
describe("isSessionEnded", () => {
  it("treats only a 401 as the end of the session", () => {
    expect(isSessionEnded(401)).toBe(true);
    for (const status of [200, 400, 403, 404, 429, 500, 503]) {
      expect(isSessionEnded(status)).toBe(false);
    }
  });
});
