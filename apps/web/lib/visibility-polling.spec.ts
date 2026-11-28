import { startVisibilityAwarePolling } from "./visibility-polling";

function harness(initiallyHidden = false) {
  let hidden = initiallyHidden;
  let listener: (() => void) | null = null;
  return {
    setHidden(value: boolean) {
      hidden = value;
      listener?.();
    },
    options: {
      isHidden: () => hidden,
      subscribeVisibility: (cb: () => void) => {
        listener = cb;
        return () => {
          listener = null;
        };
      },
    },
    get subscribed() {
      return listener !== null;
    },
  };
}

describe("startVisibilityAwarePolling", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("polls on every interval while the tab is visible (unchanged behaviour)", () => {
    const run = jest.fn();
    const h = harness(false);
    startVisibilityAwarePolling({ intervalMs: 60_000, run, ...h.options });
    jest.advanceTimersByTime(180_000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("issues no requests while the tab is hidden", () => {
    const run = jest.fn();
    const h = harness(true);
    startVisibilityAwarePolling({ intervalMs: 60_000, run, ...h.options });
    jest.advanceTimersByTime(60 * 60_000); // an hour in a background tab
    expect(run).not.toHaveBeenCalled();
  });

  it("catches up immediately when the tab becomes visible, not a full interval later", () => {
    const run = jest.fn();
    const h = harness(true);
    startVisibilityAwarePolling({ intervalMs: 60_000, run, ...h.options });
    jest.advanceTimersByTime(30 * 60_000);
    expect(run).not.toHaveBeenCalled();
    h.setHidden(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not run on the hidden transition itself", () => {
    const run = jest.fn();
    const h = harness(false);
    startVisibilityAwarePolling({ intervalMs: 60_000, run, ...h.options });
    h.setHidden(true);
    expect(run).not.toHaveBeenCalled();
  });

  it("stops for good once shouldStop is true, and unsubscribes", () => {
    const run = jest.fn();
    const h = harness(false);
    let ended = false;
    startVisibilityAwarePolling({
      intervalMs: 60_000,
      run,
      shouldStop: () => ended,
      ...h.options,
    });
    jest.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(1);
    ended = true;
    jest.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(h.subscribed).toBe(false);
    jest.advanceTimersByTime(10 * 60_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a visibility change after the session ended does not poll", () => {
    const run = jest.fn();
    const h = harness(true);
    let ended = false;
    startVisibilityAwarePolling({
      intervalMs: 60_000,
      run,
      shouldStop: () => ended,
      ...h.options,
    });
    ended = true;
    h.setHidden(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("the returned function stops it and is safe to call twice", () => {
    const run = jest.fn();
    const h = harness(false);
    const stop = startVisibilityAwarePolling({
      intervalMs: 60_000,
      run,
      ...h.options,
    });
    stop();
    stop();
    jest.advanceTimersByTime(5 * 60_000);
    expect(run).not.toHaveBeenCalled();
    expect(h.subscribed).toBe(false);
  });
});
