import { powerMonitor } from "electron";
import type { AgentConfig } from "./types";
import type { HeartbeatEvent } from "./types";

export class ActivityTracker {
  buildHeartbeat(input: {
    config: AgentConfig;
    sessionId: string;
    deviceId: string;
    agentVersion: string;
  }): HeartbeatEvent {
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const state =
      idleSeconds >= input.config.tracking.awayThresholdSeconds
        ? "AWAY"
        : idleSeconds >= input.config.tracking.idleThresholdSeconds
          ? "IDLE"
          : "ACTIVE";

    return {
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      state,
      idleSeconds,
      activeApp: null,
      windowTitle: null,
      agentVersion: input.agentVersion,
      occurredAt: new Date().toISOString(),
    };
  }
}
