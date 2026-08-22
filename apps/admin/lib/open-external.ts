/**
 * Open a URL in a new tab, and be honest about whether it opened.
 *
 * WHY THIS EXISTS. "Open Tenant" called
 * `window.open(url, "_blank", "noopener,noreferrer")` and then reported "Tenant
 * workspace opened." unconditionally. Two things were wrong with that, and the
 * second is the one that matters.
 *
 * Passing **any** features string makes Chrome treat the call as a request for
 * a *popup window* rather than a tab, and popups opened from a handler that is
 * even slightly detached from the click gesture are blocked silently. So the
 * common outcome was: nothing visible happens, and a green toast says it did.
 *
 * `noopener` is not lost by dropping the features string — `window.open`
 * returns a handle and this severs it, which is the same protection. What is
 * gained is a tab, and a return value that can be checked.
 *
 * The reporting is the point. A control that claims success it cannot observe
 * is the defect this codebase has now fixed four times under different names —
 * a badge counting nothing, a retry that reported SUCCEEDED while skipping a
 * step, a preference stored and never applied, a theme that repainted nothing.
 */
export type OpenExternalResult = {
  opened: boolean;
  /** Rendered to the operator. Carries the URL when it could not be opened. */
  message: string;
  url: string;
};

/**
 * The whole decision, with the opener passed in.
 *
 * Split out because `apps/admin` jest runs in a node environment with no jsdom
 * ([[ITEM-0001]]), so `window` does not exist in a test — and the part worth
 * asserting here is not the browser call, it is what is concluded from its
 * result. Injecting the opener makes that testable without adding a DOM.
 */
export function openWith(
  open: (url: string, target: string) => Window | null,
  url: string,
  what = "The page",
): OpenExternalResult {
  if (!url) {
    return {
      opened: false,
      message: `${what} has no address to open.`,
      url,
    };
  }

  /*
   * No features string: a tab, not a popup. The handle is severed immediately
   * rather than asked for `noopener` in a string the browser reads as "make
   * this a window".
   */
  const handle = open(url, "_blank");
  if (!handle) {
    return {
      opened: false,
      /*
       * Named as a browser decision rather than a failure of ours, and the URL
       * is included so the operator can reach it regardless. "Nothing happened"
       * with no explanation is what this replaces.
       */
      message: `${what} could not be opened — your browser blocked the new tab. Allow pop-ups for this site, or open ${url} directly.`,
      url,
    };
  }

  handle.opener = null;
  return { opened: true, message: `${what} opened in a new tab.`, url };
}

/** The browser wrapper. Everything it decides lives in `openWith`. */
export function openExternal(url: string, what = "The page") {
  return openWith((target, name) => window.open(target, name), url, what);
}
