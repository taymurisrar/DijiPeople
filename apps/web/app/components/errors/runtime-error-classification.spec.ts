import {
  classifyRuntimeError,
  RUNTIME_ERROR_USER_MESSAGE,
} from "./runtime-error-classification";

/*
 * BUG-3496 — the global handler's decision for browser-raised errors. The
 * provider calls this before showing the modal or persisting a client error
 * log row, so "ignore" means neither happens.
 */
describe("classifyRuntimeError", () => {
  it.each(["418", "419", "422", "423", "425"])(
    "ignores minified hydration error #%s",
    (code) => {
      const error = new Error(
        `Minified React error #${code}; visit https://react.dev/errors/${code} for the full message`,
      );
      expect(classifyRuntimeError(error)).toEqual({ kind: "ignore" });
    },
  );

  it("ignores a development hydration mismatch message", () => {
    expect(
      classifyRuntimeError(
        new Error(
          "Hydration failed because the server rendered text didn't match the client.",
        ),
      ),
    ).toEqual({ kind: "ignore" });
  });

  it("still reports an ordinary runtime error, unchanged", () => {
    expect(
      classifyRuntimeError(new TypeError("Cannot read properties of undefined")),
    ).toEqual({ kind: "report" });
  });

  it("reports a non-hydration minified React error without its raw text", () => {
    expect(
      classifyRuntimeError(new Error("Minified React error #310; visit …")),
    ).toEqual({ kind: "report", userMessage: RUNTIME_ERROR_USER_MESSAGE });
  });

  it("ignores ResizeObserver noise and aborted requests", () => {
    expect(
      classifyRuntimeError(
        new Error("ResizeObserver loop completed with undelivered notifications."),
      ),
    ).toEqual({ kind: "ignore" });
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(classifyRuntimeError(abort)).toEqual({ kind: "ignore" });
  });
});
