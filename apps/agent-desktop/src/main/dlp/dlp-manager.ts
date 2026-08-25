import type {
  ClipboardCaptureEvent,
  DlpConfig,
  ScreenCaptureEvent,
} from "../types";
import { ClipboardWatcher, type ClipboardReader } from "./clipboard-watcher";
import {
  DlpRuleEvaluator,
  type DlpTrigger,
  type ForegroundApp,
} from "./rule-evaluator";
import type { AgentLogger } from "../logger";

export interface DlpForegroundProvider {
  current(): Promise<ForegroundApp>;
}

export interface DlpScreenshotCapturer {
  /** Captures the screen now, or returns null if capture is unavailable. */
  capture(): Promise<{
    imageBase64: string;
    contentSha256: string;
    contentBytes: number;
  } | null>;
}

export interface DlpApiSink {
  sendClipboardEvents(events: ClipboardCaptureEvent[]): Promise<unknown>;
  sendScreenshotEvents(events: ScreenCaptureEvent[]): Promise<unknown>;
}

export interface DlpSessionContext {
  sessionId: string;
  deviceId: string;
  agentVersion: string;
}

const MAX_PENDING = 200;

/**
 * Drives DLP capture on the agent (TASK-0020): it samples the clipboard, arms
 * rules on a copy from a sensitive source, and — when a channel app then comes
 * forward — captures a screenshot. It sends what it collects to the API, which
 * enforces the tenant flags again and decides what is actually stored.
 *
 * It captures nothing unless the server enabled the matching capability. It is
 * clock-free in its decisions (the evaluator is clock-injected) and holds no
 * Electron handles of its own — the clipboard reader, the foreground provider
 * and the screenshot capturer are injected, so the whole cycle is unit-tested
 * without an Electron main process.
 *
 * NOTE: screenshot triggers ride on clipboard detection — a rule fires from a
 * copy the watcher saw — so screenshot capture is only meaningful when clipboard
 * capture is also on. That is the intended model: the exfiltration signal is the
 * copy, not the screen.
 */
export class DlpManager {
  private readonly watcher = new ClipboardWatcher();
  private readonly evaluator = new DlpRuleEvaluator();
  private config: DlpConfig | null = null;
  private timer: NodeJS.Timeout | null = null;
  private getSession: (() => DlpSessionContext | null) | null = null;
  private ticking = false;
  private readonly pendingClipboard: ClipboardCaptureEvent[] = [];
  private readonly pendingScreenshots: ScreenCaptureEvent[] = [];

  constructor(
    private readonly reader: ClipboardReader,
    private readonly foreground: DlpForegroundProvider,
    private readonly screenshots: DlpScreenshotCapturer,
    private readonly api: DlpApiSink,
    private readonly logger: AgentLogger,
  ) {}

  /**
   * Applies the current DLP config. Safe to call on every config refresh — it is
   * idempotent: it updates the rules cheaply each time, but only primes the
   * clipboard baseline and starts the timer on the transition from off to on, so
   * a refresh mid-session does not reset the baseline and swallow a copy. A
   * tenant switching capture off is honoured within one refresh.
   */
  configure(
    config: DlpConfig,
    getSession: () => DlpSessionContext | null,
  ): void {
    const wasRunning = this.timer !== null;
    const previousInterval = this.config?.clipboardPollIntervalSeconds;

    this.config = config;
    this.getSession = getSession;
    this.evaluator.configure(config.rules, config.triggerWindowSeconds);

    const shouldRun =
      config.clipboardCaptureEnabled || config.screenshotCaptureEnabled;

    if (!shouldRun) {
      this.stop();
      return;
    }

    if (!wasRunning) {
      // Off -> on: establish the baseline and begin sampling.
      this.watcher.prime(this.reader);
      this.startTimer(config.clipboardPollIntervalSeconds);
      return;
    }

    // Already running: only restart the timer if the cadence changed, and never
    // re-prime (that would drop the current clipboard baseline).
    if (previousInterval !== config.clipboardPollIntervalSeconds) {
      this.startTimer(config.clipboardPollIntervalSeconds);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.watcher.reset();
  }

  private startTimer(pollSeconds: number): void {
    if (this.timer) clearInterval(this.timer);
    const intervalMs = Math.max(1, pollSeconds) * 1000;
    this.timer = setInterval(() => {
      void this.tickOnce();
    }, intervalMs);
    // A background sampling timer must not, on its own, keep the process alive —
    // the Electron app's own handles do that. Also stops the timer leaking a
    // worker in tests.
    this.timer.unref?.();
  }

  /** One sampling cycle. Public for tests; the timer calls it. */
  async tickOnce(): Promise<void> {
    if (this.ticking) return;
    const config = this.config;
    const session = this.getSession?.() ?? null;
    if (!config || !session) return;

    this.ticking = true;
    try {
      await this.flushPending(session);

      if (!config.clipboardCaptureEnabled) return;

      const foreground = await this.foreground.current();
      const now = Date.now();

      const sample = this.watcher.poll(this.reader, {
        fullContent: config.clipboardFullContent,
        maxBytes: config.maxClipboardBytes,
      });

      if (sample) {
        this.evaluator.noteClipboardCopy(foreground, now);
        await this.emitClipboard(session, foreground, sample);
      }

      const triggers = this.evaluator.evaluateForeground(foreground, now);
      if (config.screenshotCaptureEnabled) {
        for (const trigger of triggers) {
          await this.emitScreenshot(session, trigger);
        }
      }
    } catch (error) {
      this.logger.warn(
        `agent.dlp.tick_failed reason=${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    } finally {
      this.ticking = false;
    }
  }

  private async emitClipboard(
    session: DlpSessionContext,
    foreground: ForegroundApp,
    sample: {
      text: string | null;
      contentBytes: number;
      contentSha256: string;
      overCap: boolean;
    },
  ): Promise<void> {
    const event: ClipboardCaptureEvent = {
      sessionId: session.sessionId,
      deviceId: session.deviceId,
      occurredAt: new Date().toISOString(),
      sourceApp: foreground.name,
      sourceAppPath: foreground.path,
      contentBytes: sample.contentBytes,
      contentSha256: sample.contentSha256,
      text: sample.text,
      overCap: sample.overCap,
      agentVersion: session.agentVersion,
    };
    try {
      await this.api.sendClipboardEvents([event]);
      // Log the event, never the content (agent AGENTS.md rule 2).
      this.logger.info("agent.dlp.clipboard.sent");
    } catch {
      this.buffer(this.pendingClipboard, event);
    }
  }

  private async emitScreenshot(
    session: DlpSessionContext,
    trigger: DlpTrigger,
  ): Promise<void> {
    const shot = await this.screenshots.capture();
    if (!shot) return;

    const event: ScreenCaptureEvent = {
      sessionId: session.sessionId,
      deviceId: session.deviceId,
      occurredAt: new Date().toISOString(),
      firedRuleId: trigger.ruleId,
      capturedReason: `${trigger.ruleName}: ${trigger.sourceApp} -> ${trigger.channelApp}`,
      contentBytes: shot.contentBytes,
      contentSha256: shot.contentSha256,
      imageBase64: shot.imageBase64,
      agentVersion: session.agentVersion,
    };
    try {
      await this.api.sendScreenshotEvents([event]);
      this.logger.info(`agent.dlp.screenshot.sent rule=${trigger.ruleId}`);
    } catch {
      this.buffer(this.pendingScreenshots, event);
    }
  }

  private async flushPending(session: DlpSessionContext): Promise<void> {
    void session;
    if (this.pendingClipboard.length > 0) {
      const batch = this.pendingClipboard.splice(
        0,
        this.pendingClipboard.length,
      );
      try {
        await this.api.sendClipboardEvents(batch);
      } catch {
        // Put them back at the front, bounded.
        this.pendingClipboard.unshift(...batch.slice(-MAX_PENDING));
      }
    }
    if (this.pendingScreenshots.length > 0) {
      const batch = this.pendingScreenshots.splice(
        0,
        this.pendingScreenshots.length,
      );
      try {
        await this.api.sendScreenshotEvents(batch);
      } catch {
        this.pendingScreenshots.unshift(...batch.slice(-MAX_PENDING));
      }
    }
  }

  private buffer<T>(queue: T[], event: T): void {
    queue.push(event);
    // Evidence is worth keeping, but not without bound. Drop the oldest.
    while (queue.length > MAX_PENDING) queue.shift();
  }
}
