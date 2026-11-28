import {
  DlpManager,
  type DlpApiSink,
  type DlpForegroundProvider,
  type DlpScreenshotCapturer,
  type DlpSessionContext,
} from "./dlp-manager";
import type { ClipboardReader } from "./clipboard-watcher";
import type { AgentLogger } from "../logger";
import type { DlpConfig } from "../types";

function config(overrides: Partial<DlpConfig> = {}): DlpConfig {
  return {
    clipboardCaptureEnabled: true,
    screenshotCaptureEnabled: true,
    clipboardFullContent: true,
    clipboardPollIntervalSeconds: 5,
    maxClipboardBytes: 1024,
    triggerWindowSeconds: 30,
    rules: [
      {
        id: "rule-1",
        name: "Payroll to WhatsApp",
        enabled: true,
        sourceAppPatterns: ["excel"],
        channelAppPatterns: ["whatsapp"],
        action: "OBSERVE",
      },
    ],
    ...overrides,
  };
}

const SESSION: DlpSessionContext = {
  sessionId: "session-1",
  deviceId: "device-1",
  agentVersion: "1.0.0",
};

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as AgentLogger;

function build(cfg: DlpConfig) {
  let clipboardText = "";
  let foreground = { name: "Excel", path: "C:/EXCEL.EXE" } as {
    name: string | null;
    path: string | null;
  };

  const reader: ClipboardReader = { readText: () => clipboardText };
  const foregroundProvider: DlpForegroundProvider = {
    current: () => Promise.resolve(foreground),
  };
  const screenshots: DlpScreenshotCapturer = {
    capture: jest.fn().mockResolvedValue({
      imageBase64: "aW1n",
      contentSha256: "sha",
      contentBytes: 3,
    }),
  };
  const api: DlpApiSink = {
    sendClipboardEvents: jest.fn().mockResolvedValue({ accepted: 1 }),
    sendScreenshotEvents: jest.fn().mockResolvedValue({ accepted: 1 }),
  };

  const manager = new DlpManager(
    reader,
    foregroundProvider,
    screenshots,
    api,
    logger,
  );
  manager.configure(cfg, () => SESSION);

  return {
    manager,
    api,
    screenshots,
    setClipboard: (v: string) => {
      clipboardText = v;
    },
    setForeground: (v: { name: string | null; path: string | null }) => {
      foreground = v;
    },
  };
}

describe("DlpManager", () => {
  afterEach(() => jest.clearAllMocks());

  it("sends a clipboard event when a copy is detected", async () => {
    const { manager, api, setClipboard } = build(config());

    setClipboard("salary data");
    await manager.tickOnce();

    expect(api.sendClipboardEvents).toHaveBeenCalledTimes(1);
    const [events] = (api.sendClipboardEvents as jest.Mock).mock.calls[0];
    expect(events[0]).toMatchObject({
      sessionId: "session-1",
      sourceApp: "Excel",
      contentSha256: expect.any(String),
      text: "salary data",
    });
  });

  it("captures a screenshot when a rule fires on a later channel foreground", async () => {
    const { manager, api, screenshots, setClipboard, setForeground } =
      build(config());

    // Tick 1: copy from Excel arms the rule.
    setClipboard("salary data");
    await manager.tickOnce();
    expect(api.sendScreenshotEvents).not.toHaveBeenCalled();

    // Tick 2: WhatsApp comes forward -> the rule fires -> a screenshot is sent.
    setForeground({ name: "WhatsApp", path: "C:/WhatsApp.exe" });
    await manager.tickOnce();

    expect(screenshots.capture).toHaveBeenCalledTimes(1);
    expect(api.sendScreenshotEvents).toHaveBeenCalledTimes(1);
    const [events] = (api.sendScreenshotEvents as jest.Mock).mock.calls[0];
    expect(events[0]).toMatchObject({
      firedRuleId: "rule-1",
      imageBase64: "aW1n",
    });
  });

  it("captures nothing while clipboard capture is off", async () => {
    const { manager, api, setClipboard } = build(
      config({
        clipboardCaptureEnabled: false,
        screenshotCaptureEnabled: false,
      }),
    );

    setClipboard("salary data");
    await manager.tickOnce();

    expect(api.sendClipboardEvents).not.toHaveBeenCalled();
    expect(api.sendScreenshotEvents).not.toHaveBeenCalled();
  });

  it("does not screenshot when screenshot capture is off, even if a rule fires", async () => {
    const { manager, api, screenshots, setClipboard, setForeground } = build(
      config({ screenshotCaptureEnabled: false }),
    );

    setClipboard("salary data");
    await manager.tickOnce();
    setForeground({ name: "WhatsApp", path: null });
    await manager.tickOnce();

    expect(screenshots.capture).not.toHaveBeenCalled();
    expect(api.sendScreenshotEvents).not.toHaveBeenCalled();
  });

  it("drops events buffered while offline once capture is switched off, and never sends them", async () => {
    const { manager, api, setClipboard } = build(config());
    (api.sendClipboardEvents as jest.Mock).mockRejectedValueOnce(new Error("offline"));

    setClipboard("salary data");
    await manager.tickOnce(); // send fails -> the event is buffered

    // The employee has not acknowledged the (new) policy: the synced config now
    // says capture is off.
    manager.configure(
      config({ clipboardCaptureEnabled: false, screenshotCaptureEnabled: false }),
      () => SESSION,
    );
    (api.sendClipboardEvents as jest.Mock).mockClear();
    await manager.tickOnce();

    expect(api.sendClipboardEvents).not.toHaveBeenCalled();
    expect(api.sendScreenshotEvents).not.toHaveBeenCalled();
  });
});

describe("DlpManager: the server's refusal wins over a stale local config", () => {
  it("stops, purges and asks for a fresh config when the server says consent is missing", async () => {
    const { manager, api, setClipboard } = build(config());
    const refused = jest.fn();
    manager.setOnCaptureRefused(refused);
    (api.sendClipboardEvents as jest.Mock).mockResolvedValueOnce({
      accepted: 0,
      captureEnabled: true,
      consentMissing: true,
    });

    setClipboard("salary data");
    await manager.tickOnce();
    expect(refused).toHaveBeenCalledTimes(1);

    // Still holding the stale "capture on" config, but sampling has stopped: a
    // further copy is neither read nor sent.
    (api.sendClipboardEvents as jest.Mock).mockClear();
    setClipboard("more salary data");
    await manager.tickOnce();
    expect(api.sendClipboardEvents).not.toHaveBeenCalled();
  });
});

describe("DlpManager: offline fail-closed", () => {
  it("captures nothing and drops its buffer while the last server answer is stale, then resumes on a fresh one", async () => {
    const { manager, api, setClipboard } = build(config());
    let fresh = true;
    manager.setFreshnessCheck(() => fresh);

    (api.sendClipboardEvents as jest.Mock).mockRejectedValueOnce(
      new Error("offline"),
    );
    setClipboard("first copy");
    await manager.tickOnce(); // send fails -> buffered while still fresh

    fresh = false; // the laptop has been offline too long to trust the consent
    (api.sendClipboardEvents as jest.Mock).mockClear();
    setClipboard("second copy");
    await manager.tickOnce();
    expect(api.sendClipboardEvents).not.toHaveBeenCalled();

    fresh = true; // a fresh config arrived
    setClipboard("third copy");
    await manager.tickOnce();
    const sent = (api.sendClipboardEvents as jest.Mock).mock.calls.flatMap(
      ([events]) => events as { text: string }[],
    );
    // The buffered first copy was dropped while stale and the second was never
    // read; only the copy made under a fresh consent goes out.
    expect(sent.map((e) => e.text)).toEqual(["third copy"]);
  });
});

describe("DlpManager: buffer isolation between sign-ins", () => {
  it("never sends one session's buffered events under another session", async () => {
    const { manager, api, setClipboard } = build(config());
    (api.sendClipboardEvents as jest.Mock).mockRejectedValueOnce(
      new Error("offline"),
    );
    setClipboard("person A's copy");
    await manager.tickOnce(); // buffered under session-1

    const other: DlpSessionContext = { ...SESSION, sessionId: "session-2" };
    manager.configure(config(), () => other);
    (api.sendClipboardEvents as jest.Mock).mockClear();
    await manager.tickOnce();

    const sent = (api.sendClipboardEvents as jest.Mock).mock.calls.flatMap(
      ([events]) => events as { sessionId: string }[],
    );
    expect(sent.filter((e) => e.sessionId === "session-1")).toEqual([]);
  });
});
