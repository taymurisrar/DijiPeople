import { OfflineQueue } from "./offline-queue";
import type { HeartbeatEvent } from "./types";

/**
 * REG-224 — ITEM-0033, and the test BUG-0036 never got.
 *
 * BUG-0036 was the agent re-sending whole batches on retry, so a heartbeat was
 * counted twice and an employee's presence was overstated. The fix landed on the
 * *server*, as idempotency — correctly, because the server is where correctness
 * has to hold. But the queue itself, the thing that decided what got re-sent,
 * kept no test saying what it is supposed to do.
 *
 * This is that statement. The queue's contract, in four parts:
 *
 *   - **drain removes.** A drained batch is gone from the queue, so a successful
 *     send cannot re-send it.
 *   - **prepend restores, at the front.** A failed batch goes back where it was,
 *     ahead of anything queued since, so order survives a retry.
 *   - **the bound drops the oldest.** An agent offline for a week must not fill
 *     the disk, and the newest heartbeats are the ones worth keeping.
 *   - **malformed events never reach the wire.** The file on disk is
 *     user-writable; anything that is not a heartbeat is discarded rather than
 *     posted.
 */
describe("OfflineQueue", () => {
  let queue: OfflineQueue;

  function heartbeat(overrides: Partial<HeartbeatEvent> = {}): HeartbeatEvent {
    return {
      sessionId: "session-1",
      deviceId: "device-1",
      state: "ACTIVE",
      idleSeconds: 0,
      activeApp: "Code",
      windowTitle: "offline-queue.ts",
      activeAppPath: "C:/code.exe",
      browserTabTitle: null,
      activeProcessId: 4242,
      agentVersion: "1.0.0",
      occurredAt: "2026-08-22T09:00:00.000Z",
      ...overrides,
    };
  }

  beforeEach(async () => {
    queue = new OfflineQueue();
    await queue.clear();
  });

  describe("the basic round trip", () => {
    it("keeps what was enqueued", async () => {
      await queue.enqueue([heartbeat({ sessionId: "a" }), heartbeat({ sessionId: "b" })]);
      expect(await queue.size()).toBe(2);
    });

    it("drains in the order events were enqueued", async () => {
      await queue.enqueue([heartbeat({ sessionId: "a" })]);
      await queue.enqueue([heartbeat({ sessionId: "b" })]);

      const batch = await queue.drain(10);
      expect(batch.map((event) => event.sessionId)).toEqual(["a", "b"]);
    });

    it("removes what it drained, so a sent batch cannot be sent again", async () => {
      // The BUG-0036 shape, stated as a property of the queue.
      await queue.enqueue([heartbeat({ sessionId: "a" }), heartbeat({ sessionId: "b" })]);

      await queue.drain(10);

      expect(await queue.size()).toBe(0);
      expect(await queue.drain(10)).toEqual([]);
    });

    it("drains at most the requested number and leaves the rest", async () => {
      await queue.enqueue([
        heartbeat({ sessionId: "a" }),
        heartbeat({ sessionId: "b" }),
        heartbeat({ sessionId: "c" }),
      ]);

      const batch = await queue.drain(2);

      expect(batch.map((event) => event.sessionId)).toEqual(["a", "b"]);
      expect(await queue.size()).toBe(1);
    });

    it("returns an empty batch from an empty queue rather than throwing", async () => {
      expect(await queue.drain(10)).toEqual([]);
    });
  });

  describe("a failed send", () => {
    it("re-sends a returned batch exactly once", async () => {
      await queue.enqueue([heartbeat({ sessionId: "a" })]);

      const first = await queue.drain(10);
      await queue.prepend(first); // the send failed
      const second = await queue.drain(10);

      expect(second.map((event) => event.sessionId)).toEqual(["a"]);
      // And not a third time: the second drain removed it too.
      expect(await queue.drain(10)).toEqual([]);
    });

    it("puts a returned batch back in front of anything queued since", async () => {
      // Order matters: heartbeats are a timeline, and a retry that lands behind
      // newer events reorders that timeline on the server.
      await queue.enqueue([heartbeat({ sessionId: "old" })]);
      const batch = await queue.drain(10);

      await queue.enqueue([heartbeat({ sessionId: "new" })]);
      await queue.prepend(batch);

      const drained = await queue.drain(10);
      expect(drained.map((event) => event.sessionId)).toEqual(["old", "new"]);
    });
  });

  describe("the bound", () => {
    it("drops the oldest, not the newest, when full", async () => {
      // An agent offline for a week must not fill the disk, and the newest
      // heartbeats are the ones worth keeping.
      const many = Array.from({ length: 6000 }, (_unused, index) =>
        heartbeat({ sessionId: `s${index}` }),
      );

      await queue.enqueue(many);

      const size = await queue.size();
      expect(size).toBe(5000); // offlineQueueMaxItems from the env stub

      const batch = await queue.drain(1);
      expect(batch[0].sessionId).toBe("s1000");
    });
  });

  describe("what never reaches the wire", () => {
    it("discards an event with no session", async () => {
      await queue.enqueue([heartbeat({ sessionId: "" })]);
      expect(await queue.size()).toBe(0);
    });

    it("discards an event with an unknown state", async () => {
      await queue.enqueue([heartbeat({ state: "SLEEPING" as never })]);
      expect(await queue.size()).toBe(0);
    });

    it("discards an event with an unparseable timestamp", async () => {
      await queue.enqueue([heartbeat({ occurredAt: "last tuesday" })]);
      expect(await queue.size()).toBe(0);
    });

    it("discards an event with a negative idle time", async () => {
      await queue.enqueue([heartbeat({ idleSeconds: -1 })]);
      expect(await queue.size()).toBe(0);
    });

    it("keeps the valid events from a mixed batch", async () => {
      await queue.enqueue([
        heartbeat({ sessionId: "good" }),
        heartbeat({ sessionId: "" }),
        heartbeat({ sessionId: "also-good" }),
      ]);

      const batch = await queue.drain(10);
      expect(batch.map((event) => event.sessionId)).toEqual(["good", "also-good"]);
    });

    it("survives an entirely non-heartbeat payload", async () => {
      await queue.enqueue([{ hello: "world" } as never]);
      expect(await queue.size()).toBe(0);
    });
  });

  describe("normalisation", () => {
    it("trims identifiers, so whitespace does not fork a session", async () => {
      await queue.enqueue([heartbeat({ sessionId: "  session-1  " })]);
      const [event] = await queue.drain(1);
      expect(event.sessionId).toBe("session-1");
    });

    it("stores a blank window title as null rather than an empty string", async () => {
      await queue.enqueue([heartbeat({ windowTitle: "   " })]);
      const [event] = await queue.drain(1);
      expect(event.windowTitle).toBeNull();
    });

    it("floors a fractional idle time", async () => {
      await queue.enqueue([heartbeat({ idleSeconds: 12.9 })]);
      const [event] = await queue.drain(1);
      expect(event.idleSeconds).toBe(12);
    });
  });

  describe("concurrency", () => {
    it("does not lose events when writes overlap", async () => {
      // The queue serialises through a promise lock. Without it, two enqueues
      // that both read-then-write would each write their own view and one would
      // silently win — losing a heartbeat, which is exactly the kind of loss
      // nobody notices.
      await Promise.all([
        queue.enqueue([heartbeat({ sessionId: "a" })]),
        queue.enqueue([heartbeat({ sessionId: "b" })]),
        queue.enqueue([heartbeat({ sessionId: "c" })]),
      ]);

      expect(await queue.size()).toBe(3);
    });

    it("does not hand the same event to two concurrent drains", async () => {
      await queue.enqueue([heartbeat({ sessionId: "a" }), heartbeat({ sessionId: "b" })]);

      const [first, second] = await Promise.all([queue.drain(1), queue.drain(1)]);
      const sessions = [...first, ...second].map((event) => event.sessionId);

      expect(new Set(sessions).size).toBe(2);
    });
  });
});
