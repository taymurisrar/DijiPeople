export type AgentState = "ACTIVE" | "IDLE" | "AWAY";

export type ConnectionState =
  | "ONLINE"
  | "OFFLINE"
  | "CONNECTING"
  | "RECONNECTING";

export type AgentVersionPolicy = {
  minimumSupportedVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
  updateMessage: string | null;
};

export type TrackingConfig = {
  enabled: boolean;
  heartbeatIntervalSeconds: number;
  idleThresholdSeconds: number;
  awayThresholdSeconds: number;
  captureActiveApp: boolean;
  captureWindowTitle: boolean;
};

export type PrivacyConfig = {
  allowScreenshots: false;
  allowClipboardTracking: false;
  allowKeylogging: false;
};

export type ApiConfig = {
  heartbeatBatchSize: number;
  offlineQueueEnabled: boolean;
};

export type FeatureConfig = {
  activeAppTracking: boolean;
  windowTitleTracking: boolean;
  offlineQueue: boolean;
  autoUpdate: boolean;
  trayStatus: boolean;
};

export type AgentConfig = {
  agentVersionPolicy: AgentVersionPolicy;
  tracking: TrackingConfig;
  privacy: PrivacyConfig;
  api: ApiConfig;
  features: FeatureConfig;
};

export type HeartbeatEvent = {
  sessionId: string;
  deviceId: string;
  state: AgentState;
  idleSeconds: number;

  activeApp: string | null;
  windowTitle: string | null;

  activeAppPath?: string | null;
  browserTabTitle?: string | null;
  activeProcessId?: number | null;

  agentVersion: string;
  occurredAt: string;
};

export type LoginTenant = {
  id: string;
  name: string;
  slug: string;
};

export type LoginUser = {
  id: string;
  employeeId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
};

export type LoginDevice = {
  id: string;
};

export type LoginTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresIn: string;
};

export type LoginResult = {
  tenant: LoginTenant;
  user: LoginUser;
  device: LoginDevice;
  tokens: LoginTokens;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_INACTIVE"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | "UNKNOWN_ERROR";

export type LoginFailureResult = {
  ok: false;
  code: LoginErrorCode;
  message: string;
  fieldErrors?: Partial<Record<keyof LoginPayload, string>>;
};

export type LoginSuccessResult = {
  ok: true;
};

export type LoginIpcResult = LoginSuccessResult | LoginFailureResult;

export type DeviceInfo = {
  deviceName: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  osVersion: string;
  agentVersion: string;
};

export type RegisteredDevice = {
  id: string;
};

export type AgentSession = {
  id: string;
};

export type SessionErrorCode =
  | "RESTORE_FAILED"
  | "LOGIN_FAILED"
  | "LOGOUT_FAILED"
  | "HEARTBEAT_FAILED"
  | "CONFIG_REFRESH_FAILED"
  | "SECURE_STORE_FAILED"
  | "UPDATE_REQUIRED"
  | "UNKNOWN_ERROR";

export type SessionError = {
  code: SessionErrorCode;
  message: string;
  cause?: unknown;
};

export type RequiredUpdatePolicy = AgentVersionPolicy;

export type AgentRuntimeSnapshot = {
  user: LoginUser | null;
  deviceId: string | null;
  sessionId: string | null;
  status: AgentState;
  connectionStatus: ConnectionState;
  lastHeartbeatSync: string | null;
};