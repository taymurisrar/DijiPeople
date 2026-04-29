import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HeartbeatEvent } from "./types";

export class OfflineQueue {
  private readonly queuePath = path.join(
    app.getPath("userData"),
    "heartbeat-queue.json",
  );

  async enqueue(events: HeartbeatEvent[]) {
    const existing = await this.read();
    await this.write([...existing, ...events].slice(-1000));
  }

  async drain(maxItems: number) {
    const existing = await this.read();
    const batch = existing.slice(0, maxItems);
    await this.write(existing.slice(batch.length));
    return batch;
  }

  async prepend(events: HeartbeatEvent[]) {
    const existing = await this.read();
    await this.write([...events, ...existing].slice(0, 1000));
  }

  private async read(): Promise<HeartbeatEvent[]> {
    try {
      const raw = await readFile(this.queuePath, "utf8");
      const parsed = JSON.parse(raw) as HeartbeatEvent[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async write(events: HeartbeatEvent[]) {
    await mkdir(path.dirname(this.queuePath), { recursive: true });
    await writeFile(this.queuePath, JSON.stringify(events), "utf8");
  }
}
