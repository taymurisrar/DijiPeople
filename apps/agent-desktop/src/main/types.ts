export type AgentState = "ACTIVE" | "IDLE" | "AWAY";
export type ConnectionState = "ONLINE" | "OFFLINE";

export type AgentConfig = {
  agentVersionPolicy: {
    minimumSupportedVersion: string;
    latestVersion: string;
    forceUpdate: boolean;
    updateMessage: string | null;
  };
  tracking: {
    enabled: boolean;
    heartbeatIntervalSeconds: number;
    idleThresholdSeconds: number;
    awayThresholdSeconds: number;
    captureActiveApp: boolean;
    captureWindowTitle: boolean;
  };
  privacy: {
    allowScreenshots: false;
    allowClipboardTracking: false;
    allowKeylogging: false;
  };
  api: {
    heartbeatBatchSize: number;
    offlineQueueEnabled: boolean;
  };
  features: {
    activeAppTracking: boolean;
    windowTitleTracking: boolean;
    offlineQueue: boolean;
    autoUpdate: boolean;
    trayStatus: boolean;
  };
};

export type HeartbeatEvent = {
  sessionId: string;
  deviceId: string;
  state: AgentState;
  idleSeconds: number;
  activeApp: string | null;
  windowTitle: string | null;
  agentVersion: string;
  occurredAt: string;
};

export type LoginResult = {
  tenant: { id: string; name: string; slug: string };
  user: {
    id: string;
    employeeId: string;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
  };
  device: { id: string };
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresIn: string;
    refreshTokenExpiresIn: string;
  };
};
