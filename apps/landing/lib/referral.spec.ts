import { captureReferralCodeFromUrl, readReferralCode } from "./referral";

/*
 * `referral.ts` is browser logic and this suite runs under `testEnvironment:
 * "node"` (see jest.config.js — jsdom is deliberately not a dependency here).
 * So the three globals it touches are stubbed by hand. That is cheap, and it
 * keeps the assertions about *attribution precedence* rather than about a DOM.
 */

const STORAGE_KEY = "dijipeople_referral";

type Jar = Map<string, string>;

function installBrowser(search: string, jar: Jar = new Map()) {
  const session = new Map<string, string>();

  const win = {
    location: { search, protocol: "https:" },
    sessionStorage: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => void session.set(key, value),
    },
  };

  const doc = {
    get cookie() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(raw: string) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1);
      // Max-Age=0 is a delete, which is how a real jar behaves.
      if (/Max-Age=0(?!\d)/i.test(raw)) jar.delete(name);
      else jar.set(name, value);
    },
  };

  (globalThis as Record<string, unknown>).window = win;
  (globalThis as Record<string, unknown>).document = doc;

  return { jar, session };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
});

describe("captureReferralCodeFromUrl", () => {
  it("remembers a genuine partner code", () => {
    installBrowser("?ref=PARTNER1");
    captureReferralCodeFromUrl();

    expect(readReferralCode()).toBe("PARTNER1");
  });

  it("keeps the first partner code when a second link is followed", () => {
    const { jar } = installBrowser("?ref=PARTNER1");
    captureReferralCodeFromUrl();

    installBrowser("?ref=PARTNER2", jar);
    captureReferralCodeFromUrl();

    // First touch wins — this is the policy the bug below was violating.
    expect(readReferralCode()).toBe("PARTNER1");
  });

  /*
   * BUG-1303. `/subscribe` offered "Ask us to arrange this plan" pointing at
   * `/contact?ref=DP-CHK-01`, so the platform's own diagnostic code took the
   * attribution slot. Combined with first-touch-wins, that meant a real
   * partner's code was discarded for the next thirty days: the partner lost the
   * commission, and nothing anywhere reported an error.
   */
  it("never stores a platform diagnostic code as a referral", () => {
    installBrowser("?ref=DP-CHK-01");
    captureReferralCodeFromUrl();

    expect(readReferralCode()).toBeUndefined();
  });

  it("lets a genuine partner code through after a diagnostic code was seen", () => {
    const { jar } = installBrowser("?ref=DP-CHK-01");
    captureReferralCodeFromUrl();

    installBrowser("?ref=REALPARTNER99", jar);
    captureReferralCodeFromUrl();

    // The assertion that matters commercially: the partner is attributed.
    expect(readReferralCode()).toBe("REALPARTNER99");
  });

  it("rejects the whole DP-XXX-nn family, not just DP-CHK-01", () => {
    for (const code of [
      "DP-CHK-02",
      "dp-chk-01",
      "DP-PAY-9",
      "DP-ABCDEF-1234",
    ]) {
      installBrowser(`?ref=${code}`);
      captureReferralCodeFromUrl();
      expect(readReferralCode()).toBeUndefined();
    }
  });

  // The guard must not be so eager that it eats real codes that merely start
  // with the letters. A partner code is not a diagnostic just because of "DP".
  it("does not reject partner codes that only look similar", () => {
    for (const code of ["DPCHK01", "DP-CHK-01-X", "DP-1", "DPARTNER-2"]) {
      const { jar } = installBrowser(`?ref=${code}`);
      captureReferralCodeFromUrl();
      expect(readReferralCode()).toBe(code.toUpperCase());
      jar.clear();
    }
  });
});

describe("readReferralCode", () => {
  /*
   * Every visitor who clicked the old link is already carrying
   * `dijipeople_referral=DP-CHK-01`, with up to thirty days left on it.
   * Guarding only the capture path would leave that cohort poisoned — still
   * attributing to an error code, and still blocking partners, because capture
   * bails whenever `readReferralCode()` returns anything at all.
   */
  it("treats an already-stored diagnostic code as absent", () => {
    const jar: Jar = new Map([[STORAGE_KEY, "DP-CHK-01"]]);
    installBrowser("", jar);

    expect(readReferralCode()).toBeUndefined();
  });

  it("lets a poisoned visitor be claimed by a real partner", () => {
    const jar: Jar = new Map([[STORAGE_KEY, "DP-CHK-01"]]);
    installBrowser("?ref=REALPARTNER99", jar);
    captureReferralCodeFromUrl();

    expect(readReferralCode()).toBe("REALPARTNER99");
  });

  it("still returns a genuine stored code", () => {
    const jar: Jar = new Map([[STORAGE_KEY, "PARTNER1"]]);
    installBrowser("", jar);

    expect(readReferralCode()).toBe("PARTNER1");
  });
});
