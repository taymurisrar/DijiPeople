import {
  createDebouncedCallback,
  resolveVisibleSelectedOption,
  isLookupResultTruncated,
  isSmallReferenceLookupEntity,
  buildLookupTruncationMessage,
  ENTITY_LOOKUP_PAGE_SIZE,
} from "./lookup-search";

describe("createDebouncedCallback", () => {
  test("collapses rapid calls into one, using the last arguments", () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const debounced = createDebouncedCallback<[string]>(
      (query) => calls.push(query),
      300,
    );

    debounced.run("e");
    debounced.run("em");
    debounced.run("emp");

    jest.advanceTimersByTime(299);
    expect(calls).toEqual([]);

    jest.advanceTimersByTime(1);
    expect(calls).toEqual(["emp"]);
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

  test("independent calls after the delay each fire", () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const debounced = createDebouncedCallback<[string]>(
      (query) => calls.push(query),
      300,
    );

    debounced.run("first");
    jest.advanceTimersByTime(300);
    debounced.run("second");
    jest.advanceTimersByTime(300);

    expect(calls).toEqual(["first", "second"]);
    jest.useRealTimers();
  });
});

describe("resolveVisibleSelectedOption", () => {
  const option = { id: "emp-50", name: "Alex Fiftieth" };

  test("returns the direct match when the current options contain it", () => {
    expect(resolveVisibleSelectedOption("emp-50", option, null)).toBe(option);
  });

  test("falls back to the previous option while the value is unchanged", () => {
    // Acceptance criterion: opening a record whose lookup value lies outside
    // the first search page still shows that value's label.
    const result = resolveVisibleSelectedOption("emp-50", null, {
      value: "emp-50",
      option,
    });
    expect(result).toBe(option);
  });

  test("drops the previous option the instant the value changes", () => {
    const result = resolveVisibleSelectedOption("emp-51", null, {
      value: "emp-50",
      option,
    });
    expect(result).toBeNull();
  });

  test("returns null once the field is cleared, even with a stale previous option", () => {
    const result = resolveVisibleSelectedOption("", null, {
      value: "emp-50",
      option,
    });
    expect(result).toBeNull();
  });
});

describe("isLookupResultTruncated", () => {
  test("a full page is treated as possibly truncated", () => {
    expect(isLookupResultTruncated(50, 50)).toBe(true);
  });

  test("a short page is treated as complete", () => {
    expect(isLookupResultTruncated(3, 50)).toBe(false);
  });

  test("no page size means no truncation claim", () => {
    expect(isLookupResultTruncated(50, undefined)).toBe(false);
  });
});

describe("isSmallReferenceLookupEntity", () => {
  test.each(["country", "countries", "Currency", "TIMEZONES"])(
    "%s is a small reference set",
    (entity) => {
      expect(isSmallReferenceLookupEntity(entity)).toBe(true);
    },
  );

  test("an entity lookup like employee is not", () => {
    expect(isSmallReferenceLookupEntity("employee")).toBe(false);
  });

  test("null/undefined is not", () => {
    expect(isSmallReferenceLookupEntity(null)).toBe(false);
    expect(isSmallReferenceLookupEntity(undefined)).toBe(false);
  });
});

describe("buildLookupTruncationMessage", () => {
  test("names the count actually shown", () => {
    expect(buildLookupTruncationMessage(ENTITY_LOOKUP_PAGE_SIZE)).toBe(
      "Showing first 50 — keep typing to narrow.",
    );
  });
});
