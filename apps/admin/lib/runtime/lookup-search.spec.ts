import { createDebouncedCallback } from "./lookup-search";

describe("createDebouncedCallback", () => {
  test("collapses rapid calls into one, using the last arguments", () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const debounced = createDebouncedCallback<[string]>(
      (query) => calls.push(query),
      300,
    );

    debounced.run("t");
    debounced.run("te");
    debounced.run("ten");

    jest.advanceTimersByTime(299);
    expect(calls).toEqual([]);

    jest.advanceTimersByTime(1);
    expect(calls).toEqual(["ten"]);
    jest.useRealTimers();
  });

  test("cancel() prevents a pending call from firing", () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const debounced = createDebouncedCallback<[string]>(
      (query) => calls.push(query),
      300,
    );

    debounced.run("a");
    debounced.cancel();
    jest.advanceTimersByTime(1000);

    expect(calls).toEqual([]);
    jest.useRealTimers();
  });
});
