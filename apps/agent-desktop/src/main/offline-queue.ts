import { app } from "electron";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentState, HeartbeatEvent } from "./types";

const MAX_QUEUE_SIZE = 1000;
const DEFAULT_DRAIN_SIZE = 50;

const VALID_AGENT_STATES: AgentState[] = ["ACTIVE", "IDLE", "AWAY"];

export class OfflineQueue {
  private readonly queuePath = path.join(
    app.getPath("userData"),
    "heartbeat-queue.json",
  );

  private readonly tempPath = `${this.queuePath}.tmp`;

  private writeLock: Promise<void> = Promise.resolve();

  async enqueue(events: HeartbeatEvent[]): Promise<void> {
    const safeEvents = this.normalizeEvents(events);

    if (safeEvents.length === 0) {
      return;
    }

    await this.withLock(async () => {
      const existing = await this.readSafe();
      const merged = [...existing, ...safeEvents].slice(-MAX_QUEUE_SIZE);

      await this.writeSafe(merged);
    });
  }

  async drain(maxItems: number): Promise<HeartbeatEvent[]> {
    const safeMaxItems = this.normalizeDrainSize(maxItems);

    return this.withLock(async () => {
      const existing = await this.readSafe();

      if (existing.length === 0) {
        return [];
      }

      const batch = existing.slice(0, safeMaxItems);
      const remaining = existing.slice(batch.length);

      await this.writeSafe(remaining);

      return batch;
    });
  }

  async prepend(events: HeartbeatEvent[]): Promise<void> {
    const safeEvents = this.normalizeEvents(events);

    if (safeEvents.length === 0) {
      return;
    }

    await this.withLock(async () => {
      const existing = await this.readSafe();
      const merged = [...safeEvents, ...existing].slice(0, MAX_QUEUE_SIZE);

      await this.writeSafe(merged);
    });
  }

  async clear(): Promise<void> {
    await this.withLock(async () => {
      await this.writeSafe([]);
    });
  }

  async size(): Promise<number> {
    return this.withLock(async () => {
      const existing = await this.readSafe();
      return existing.length;
    });
  }

  private async readSafe(): Promise<HeartbeatEvent[]> {
    try {
      const raw = await readFile(this.queuePath, "utf8");
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return this.normalizeEvents(parsed);
    } catch {
      return [];
    }
  }

  private async writeSafe(events: HeartbeatEvent[]): Promise<void> {
    await mkdir(path.dirname(this.queuePath), { recursive: true });

    const safeEvents = this.normalizeEvents(events).slice(-MAX_QUEUE_SIZE);
    const payload = JSON.stringify(safeEvents);

    try {
      await writeFile(this.tempPath, payload, "utf8");
      await rename(this.tempPath, this.queuePath);
    } catch (error) {
      await unlink(this.tempPath).catch(() => undefined);
      throw error;
    }
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let releaseLock!: () => void;

    const previousLock = this.writeLock;

    this.writeLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;

    try {
      return await fn();
    } finally {
      releaseLock();
    }
  }

  private normalizeEvents(events: unknown): HeartbeatEvent[] {
    if (!Array.isArray(events)) {
      return [];
    }

    return events
      .filter((event): event is HeartbeatEvent =>
        this.isValidHeartbeatEvent(event),
      )
      .map((event) => ({
        sessionId: event.sessionId.trim(),
        deviceId: event.deviceId.trim(),
        state: event.state,
        idleSeconds: Math.max(0, Math.floor(event.idleSeconds)),

        activeApp: this.normalizeNullableText(event.activeApp),
        windowTitle: this.normalizeNullableText(event.windowTitle),

        activeAppPath: this.normalizeNullableText(event.activeAppPath),
        browserTabTitle: this.normalizeNullableText(event.browserTabTitle),
        activeProcessId: this.normalizeNullableNumber(event.activeProcessId),

        agentVersion: event.agentVersion.trim(),
        occurredAt: event.occurredAt,
      }))
      .slice(-MAX_QUEUE_SIZE);
  }

  private isValidHeartbeatEvent(event: unknown): event is HeartbeatEvent {
    if (!event || typeof event !== "object") {
      return false;
    }

    const e = event as HeartbeatEvent;

    if (!this.isNonEmptyString(e.sessionId)) {
      return false;
    }

    if (!this.isNonEmptyString(e.deviceId)) {
      return false;
    }

    if (!VALID_AGENT_STATES.includes(e.state)) {
      return false;
    }

    if (!Number.isFinite(e.idleSeconds) || e.idleSeconds < 0) {
      return false;
    }

    if (!this.isNonEmptyString(e.agentVersion)) {
      return false;
    }

    if (!this.isValidIsoDate(e.occurredAt)) {
      return false;
    }

    if (!this.isNullableString(e.activeApp)) {
      return false;
    }

    if (!this.isNullableString(e.windowTitle)) {
      return false;
    }

    if (!this.isNullableString(e.activeAppPath)) {
      return false;
    }

    if (!this.isNullableString(e.browserTabTitle)) {
      return false;
    }

    if (!this.isNullableNumber(e.activeProcessId)) {
      return false;
    }

    return true;
  }

  private normalizeDrainSize(maxItems: number): number {
    if (!Number.isFinite(maxItems) || maxItems <= 0) {
      return DEFAULT_DRAIN_SIZE;
    }

    return Math.min(Math.floor(maxItems), MAX_QUEUE_SIZE);
  }

  private normalizeNullableText(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeNullableNumber(value: unknown): number | null {
    if (!Number.isFinite(value)) {
      return null;
    }

    return Math.floor(value as number);
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }

  private isNullableString(value: unknown): boolean {
    return value === undefined || value === null || typeof value === "string";
  }

  private isNullableNumber(value: unknown): boolean {
    return value === undefined || value === null || Number.isFinite(value);
  }

  private isValidIsoDate(value: unknown): value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
      return false;
    }

    const timestamp = Date.parse(value);

    return Number.isFinite(timestamp);
  }
}