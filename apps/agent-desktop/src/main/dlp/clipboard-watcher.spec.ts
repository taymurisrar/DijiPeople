import { ClipboardWatcher, type ClipboardReader } from "./clipboard-watcher";

function reader(value: string): ClipboardReader {
  return { readText: () => value };
}

const FULL = { fullContent: true, maxBytes: 1024 };

describe("ClipboardWatcher", () => {
  it("emits a sample with hash and byte count when the clipboard changes", () => {
    const w = new ClipboardWatcher();

    const sample = w.poll(reader("salary data"), FULL);

    expect(sample).not.toBeNull();
    expect(sample!.contentBytes).toBe(Buffer.byteLength("salary data", "utf8"));
    expect(sample!.contentSha256).toHaveLength(64);
    expect(sample!.text).toBe("salary data");
    expect(sample!.overCap).toBe(false);
  });

  it("emits once for the same content polled twice", () => {
    const w = new ClipboardWatcher();
    const r = reader("same");

    expect(w.poll(r, FULL)).not.toBeNull();
    expect(w.poll(r, FULL)).toBeNull();
  });

  it("does not capture the content already present when priming", () => {
    const w = new ClipboardWatcher();

    w.prime(reader("pre-existing"));
    expect(w.poll(reader("pre-existing"), FULL)).toBeNull();

    // Only a change after priming is captured.
    expect(w.poll(reader("newly copied"), FULL)).not.toBeNull();
  });

  it("omits the text in metadata-only mode but still reports size and hash", () => {
    const w = new ClipboardWatcher();

    const sample = w.poll(reader("secret"), {
      fullContent: false,
      maxBytes: 1024,
    });

    expect(sample).not.toBeNull();
    expect(sample!.text).toBeNull();
    expect(sample!.contentBytes).toBe(6);
    expect(sample!.contentSha256).toHaveLength(64);
  });

  it("does not truncate an over-cap sample; it drops the text and flags it", () => {
    const w = new ClipboardWatcher();
    const big = "x".repeat(100);

    const sample = w.poll(reader(big), { fullContent: true, maxBytes: 10 });

    expect(sample).not.toBeNull();
    expect(sample!.text).toBeNull();
    expect(sample!.overCap).toBe(true);
    expect(sample!.contentBytes).toBe(100);
  });

  it("treats an empty clipboard as nothing to report and no baseline", () => {
    const w = new ClipboardWatcher();

    expect(w.poll(reader(""), FULL)).toBeNull();
    // A copy after an empty read is still captured (the empty read set no baseline).
    expect(w.poll(reader("copied"), FULL)).not.toBeNull();
  });

  it("swallows a clipboard read that throws", () => {
    const w = new ClipboardWatcher();
    const throwing: ClipboardReader = {
      readText: () => {
        throw new Error("clipboard is locked by another process");
      },
    };

    expect(() => w.poll(throwing, FULL)).not.toThrow();
    expect(w.poll(throwing, FULL)).toBeNull();
  });
});
