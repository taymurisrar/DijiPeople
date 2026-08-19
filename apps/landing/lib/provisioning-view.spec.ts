import {
  canOpenWorkspace,
  eyebrowFor,
  headlineFor,
  isTerminalState,
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
