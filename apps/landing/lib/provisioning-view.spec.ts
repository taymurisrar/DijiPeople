import {
  canOpenWorkspace,
  eyebrowFor,
  headlineFor,
  isTerminalState,
  nextDelayMs,
  pollDelayMs,
  RATE_LIMITED_DELAY_MS,
  pollErrorMessage,
  type OnboardingStatusView,
} from "./provisioning-view";

function status(
  overrides: Partial<OnboardingStatusView> = {},
): OnboardingStatusView {
  return {
    orderNumber: "SO-2026-000123",
    state: "PROVISIONING",
    steps: [
      { key: "customer-account", label: "Customer account created", state: "DONE" },
      { key: "payment-confirmed", label: "Payment confirmed", state: "DONE" },
      { key: "workspace-created", label: "Workspace created", state: "PENDING" },
      { key: "workspace-ready", label: "Finishing setup", state: "PENDING" },
    ],
    workspace: null,
    actionRequired: null,
    ...overrides,
  };
}

const READY_WORKSPACE = {
  name: "Acme",
  hostname: "acme.dijipeople.com",
  url: "https://acme.dijipeople.com",
};

describe("isTerminalState", () => {
  it("stops polling once the workspace is ready or a human is needed", () => {
    expect(isTerminalState("READY")).toBe(true);
    expect(isTerminalState("ACTION_REQUIRED")).toBe(true);
  });

  it("keeps polling through every state that can still move", () => {
    expect(isTerminalState("AWAITING_PAYMENT")).toBe(false);
    expect(isTerminalState("PAYMENT_CONFIRMED")).toBe(false);
    expect(isTerminalState("PROVISIONING")).toBe(false);
  });

  // An expired checkout session is not an expired order — a second payment
  // attempt still drives it forward, and a page that stopped listening would
  // never show the workspace it produced.
  it("keeps polling an expired session", () => {
    expect(isTerminalState("EXPIRED")).toBe(false);
  });
});

describe("canOpenWorkspace", () => {
  it("opens the workspace only when the API returned one", () => {
    expect(
      canOpenWorkspace(status({ state: "READY", workspace: READY_WORKSPACE })),
    ).toBe(true);
  });

  /*
   * The failure this exists for: a tenant marked ready before its primary domain
   * row exists. The button would point nowhere, and the customer would meet a
   * 404 immediately after paying.
   */
  it("refuses to offer a button when READY carries no workspace", () => {
    expect(canOpenWorkspace(status({ state: "READY", workspace: null }))).toBe(
      false,
    );
  });

  it("refuses to offer a button before the state says ready", () => {
    expect(
      canOpenWorkspace(
        status({ state: "PROVISIONING", workspace: READY_WORKSPACE }),
      ),
    ).toBe(false);
  });

  it("handles the first render, before any status has arrived", () => {
    expect(canOpenWorkspace(null)).toBe(false);
  });
});

describe("headlineFor", () => {
  it("claims nothing before the first status arrives", () => {
    expect(headlineFor(null)).toBe("We're preparing your DijiPeople workspace.");
  });

  it("announces readiness only when the workspace is openable", () => {
    expect(
      headlineFor(status({ state: "READY", workspace: READY_WORKSPACE })),
    ).toBe("Your workspace is ready.");
    expect(headlineFor(status({ state: "READY", workspace: null }))).toBe(
      "We're finishing the last step.",
    );
  });

  /*
   * Arriving on this page means Stripe redirected the browser back — not that
   * payment is confirmed. Only the verified webhook says that. For the seconds
   * before it lands, the page must not congratulate anybody.
   */
  it("does not treat the Stripe redirect as proof of payment", () => {
    expect(headlineFor(status({ state: "AWAITING_PAYMENT" }))).toBe(
      "We're confirming your payment.",
    );
  });

  it("names an expired session plainly", () => {
    expect(headlineFor(status({ state: "EXPIRED" }))).toBe(
      "This checkout session expired.",
    );
  });

  it("says a human is involved when provisioning needs one", () => {
    expect(headlineFor(status({ state: "ACTION_REQUIRED" }))).toBe(
      "We need to look at something.",
    );
  });
});

describe("eyebrowFor", () => {
  it("only reads 'ready' when the workspace can be opened", () => {
    expect(eyebrowFor(status({ state: "READY", workspace: READY_WORKSPACE }))).toBe(
      "Workspace ready",
    );
    expect(eyebrowFor(status({ state: "READY", workspace: null }))).toBe(
      "Setting up",
    );
    expect(eyebrowFor(null)).toBe("Setting up");
  });
});

describe("pollErrorMessage", () => {
  it("tells somebody with a missing order to talk to a human", () => {
    expect(pollErrorMessage(404)).toContain("could not find this order");
  });

  // A blip is not a failure. The poll is still running, and saying otherwise
  // sends people to support over three seconds of bad network.
  it("treats every other failure as transient", () => {
    for (const code of [500, 502, 429, null]) {
      expect(pollErrorMessage(code)).toContain("Still trying");
    }
  });
});

describe("pollDelayMs", () => {
  it("polls quickly while provisioning is likely still running", () => {
    expect(pollDelayMs(0)).toBe(2_000);
    expect(pollDelayMs(29_999)).toBe(2_000);
  });

  it("backs off once the wait is clearly not a normal one", () => {
    expect(pollDelayMs(30_000)).toBe(5_000);
    expect(pollDelayMs(120_000)).toBe(15_000);
    expect(pollDelayMs(9 * 60_000)).toBe(15_000);
  });

  /*
   * The reason the backoff exists. PublicRateLimitGuard allows 120 GETs per ten
   * minutes per IP and path, and this page's path carries the order id — so 120
   * is the entire budget. A flat three-second poll spends 200 and starts
   * collecting 429s six minutes in, precisely when something has gone slow and
   * the customer is still watching. This test is the arithmetic, so a future
   * tightening of the interval fails here rather than in production.
   */
  it("stays inside the platform's own rate limit for a full ten minutes", () => {
    const WINDOW_MS = 10 * 60_000;
    const GUARD_GET_LIMIT = 120;

    let elapsed = 0;
    let requests = 0;
    while (elapsed < WINDOW_MS) {
      requests += 1;
      elapsed += pollDelayMs(elapsed);
    }

    expect(requests).toBeLessThan(GUARD_GET_LIMIT);
  });
});

describe("nextDelayMs", () => {
  it("uses the normal cadence for an ordinary response", () => {
    expect(nextDelayMs(0, 200)).toBe(2_000);
    expect(nextDelayMs(0, null)).toBe(2_000);
    expect(nextDelayMs(5 * 60_000, 500)).toBe(15_000);
  });

  // Retrying a 429 at the same cadence turns one into a wall of them.
  it("waits out a slice of the window after a 429, however early it arrives", () => {
    expect(nextDelayMs(0, 429)).toBe(RATE_LIMITED_DELAY_MS);
    expect(nextDelayMs(9 * 60_000, 429)).toBe(RATE_LIMITED_DELAY_MS);
  });
});
