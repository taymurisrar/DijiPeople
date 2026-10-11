import {
  canOpenWorkspace,
  eyebrowFor,
  headlineFor,
  isTerminalState,
  nextDelayMs,
  pollDelayMs,
  RATE_LIMITED_DELAY_MS,
  pollErrorMessage,
  statusPollUrl,
  timedOutMessage,
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

  // The moment the buyer was anxious about must change the headline, not
  // just a tick in the list.
  it("gives payment confirmed and provisioning their own lines", () => {
    const awaiting = headlineFor(status({ state: "AWAITING_PAYMENT" }));
    const confirmed = headlineFor(status({ state: "PAYMENT_CONFIRMED" }));
    const provisioning = headlineFor(status({ state: "PROVISIONING" }));

    expect(confirmed).toBe("Payment received. We're creating your workspace.");
    expect(provisioning).toBe("We're setting up your workspace.");
    expect(new Set([awaiting, confirmed, provisioning]).size).toBe(3);
  });
});

describe("timedOutMessage", () => {
  // Never claim the payment is safe when nothing has confirmed it.
  it("does not reassure about a payment that was never confirmed", () => {
    const message = timedOutMessage(status({ state: "AWAITING_PAYMENT" }));
    expect(message).toContain("not received confirmation");
    expect(message).toContain("do not pay again");
    expect(message).toContain("SO-2026-000123");
    expect(message).not.toContain("payment is confirmed");
    expect(timedOutMessage(null)).toContain("not received confirmation");
  });

  it("says the payment is confirmed only once it is", () => {
    for (const state of ["PAYMENT_CONFIRMED", "PROVISIONING"] as const) {
      expect(timedOutMessage(status({ state }))).toContain(
        "payment is confirmed",
      );
    }
  });
});

describe("statusPollUrl", () => {
  it("forwards Stripe's session id so the API can ask Stripe straight away", () => {
    expect(statusPollUrl("order-1", "cs_test_abc123")).toBe(
      "/api/public/onboarding/order-1/status?session_id=cs_test_abc123",
    );
  });

  it("polls without it when it is absent or not a checkout session id", () => {
    const bare = "/api/public/onboarding/order-1/status";
    expect(statusPollUrl("order-1")).toBe(bare);
    expect(statusPollUrl("order-1", null)).toBe(bare);
    expect(statusPollUrl("order-1", "{CHECKOUT_SESSION_ID}")).toBe(bare);
    expect(statusPollUrl("order-1", "cs_a&admin=1")).toBe(bare);
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
    expect(pollDelayMs(59_999)).toBe(2_000);
  });

  it("backs off once the wait is clearly not a normal one", () => {
    expect(pollDelayMs(60_000)).toBe(4_000);
    expect(pollDelayMs(179_999)).toBe(4_000);
    expect(pollDelayMs(180_000)).toBe(10_000);
    expect(pollDelayMs(9 * 60_000)).toBe(10_000);
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
    expect(nextDelayMs(5 * 60_000, 500)).toBe(10_000);
  });

  // Retrying a 429 at the same cadence turns one into a wall of them.
  it("waits out a slice of the window after a 429, however early it arrives", () => {
    expect(nextDelayMs(0, 429)).toBe(RATE_LIMITED_DELAY_MS);
    expect(nextDelayMs(9 * 60_000, 429)).toBe(RATE_LIMITED_DELAY_MS);
  });
});
