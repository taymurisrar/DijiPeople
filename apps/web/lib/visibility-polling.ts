/**
 * Polling that does not run in a tab nobody is looking at.
 *
 * Every signed-in tab used to poll the API on a fixed timer whether or not it
 * was visible. A person with five tabs open overnight issued five tabs' worth of
 * authenticated requests every minute for nobody (SESSION-0136 frontend audit:
 * the notification bell and popup each polled every 60 s per tab).
 *
 * Contract, deliberately conservative so no notification is lost:
 *
 * - While the document is hidden the timer still ticks but runs nothing.
 * - The moment it becomes visible again, `run` is called once immediately, so
 *   whatever arrived while hidden is shown on return rather than up to a full
 *   interval later.
 * - A visible tab behaves exactly as before.
 * - `shouldStop` lets the caller end polling permanently (a signed-out session);
 *   it is checked on every tick and every visibility change.
 *
 * Environment access is injectable so this is unit-testable without a DOM.
 */
export type VisibilityPollingOptions = {
  intervalMs: number;
  run: () => void;
  shouldStop?: () => boolean;
  isHidden?: () => boolean;
  subscribeVisibility?: (onChange: () => void) => () => void;
};

export function startVisibilityAwarePolling(
  options: VisibilityPollingOptions,
): () => void {
  const hidden =
    options.isHidden ??
    (() =>
      typeof document !== "undefined" && document.visibilityState === "hidden");

  const subscribe =
    options.subscribeVisibility ??
    ((onChange: () => void) => {
      if (typeof document === "undefined") return () => undefined;
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    });

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: () => void = () => undefined;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearInterval(timer);
    timer = null;
    unsubscribe();
  };

  const tick = () => {
    if (options.shouldStop?.()) {
      stop();
      return;
    }
    if (hidden()) return;
    options.run();
  };

  timer = setInterval(tick, options.intervalMs);
  unsubscribe = subscribe(() => {
    if (stopped) return;
    if (options.shouldStop?.()) {
      stop();
      return;
    }
    if (!hidden()) options.run();
  });

  return stop;
}
