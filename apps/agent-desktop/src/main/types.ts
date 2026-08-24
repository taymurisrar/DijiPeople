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

export type PolicyConfig = {
  mandatory: boolean;
  allowUserQuit: boolean;
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
  // Screenshots and clipboard capture are data-loss-prevention capabilities a
  // tenant may switch on from Platform Admin (TASK-0020) after real incidents of
  // employees sharing sensitive information over WhatsApp. They were previously
  // pinned to the literal `false`; they are now ordinary server-controlled
  // booleans, gated by the tenant config and enforced again on the API when the
  // event is written.
  allowScreenshots: boolean;
  allowClipboardTracking: boolean;
  // Keylogging stays permanently unavailable, and its type stays the literal
  // `false` so the compiler — not a code review — rejects any attempt to turn it
  // on. It records what is *typed*, not what is *read* or *copied*, so it barely
  // touches the paste-into-WhatsApp threat while carrying the largest liability
  // of the three. Dropping it was an explicit owner decision; see
  // docs/plans/EXECPLAN-0022-dlp-desktop-agent-capture.md.
  allowKeylogging: false;
  allowCameraAccess: boolean;
  allowMicrophoneAccess: boolean;
  allowLocationAccess: boolean;
};

/**
 * The action a fired DLP rule takes. Only OBSERVE is honoured today (the owner
 * chose record-only); ALERT and BLOCK exist so that adding prevention later is a
 * behaviour change on the server, not a schema or contract change here.
 */
export type DlpRuleAction = "OBSERVE" | "ALERT" | "BLOCK";

/**
 * One tenant-configured exfiltration rule. A rule fires when content is copied
 * while a `sourceAppPatterns` application is in front, and a
 * `channelAppPatterns` application then becomes the foreground — the shape of
 * "opened the salary sheet, pasted it into WhatsApp". Patterns are matched
 * case-insensitively as substrings against the foreground app's name and path,
 * so `"whatsapp"` matches `WhatsApp.exe` and a browser tab titled "WhatsApp".
 */
export type DlpRuleConfig = {
  id: string;
  name: string;
  enabled: boolean;
  sourceAppPatterns: string[];
  channelAppPatterns: string[];
  action: DlpRuleAction;
};

export type DlpConfig = {
  // The two master gates, mirrored from `privacy` for local convenience. The
  // agent captures nothing unless the matching gate is true; the API enforces
  // the same gate again when the event is written, so a stale or tampered client
  // cannot collect for a tenant that switched it off.
  clipboardCaptureEnabled: boolean;
  screenshotCaptureEnabled: boolean;
  // Full-content mode stores the clipboard text and full screenshot bytes. When
  // false, only metadata (size, hash, source/destination app) leaves the
  // machine. The owner chose full content; the flag is kept so a tenant can
  // narrow it without a new build.
  clipboardFullContent: boolean;
  // How often the clipboard is sampled, and the largest sample that is kept.
  // Anything larger is recorded by metadata only, never truncated-then-stored,
  // so a giant paste cannot silently become a partial exhibit.
  clipboardPollIntervalSeconds: number;
  maxClipboardBytes: number;
  // How long a copy from a sensitive source stays "recent" for the purpose of
  // firing a rule when a channel app comes forward.
  triggerWindowSeconds: number;
  rules: DlpRuleConfig[];
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
  cameraAccess: boolean;
  microphoneAccess: boolean;
  locationAccess: boolean;
};

export type AgentConfig = {
  agentVersionPolicy: AgentVersionPolicy;
  policy: PolicyConfig;
  tracking: TrackingConfig;
  privacy: PrivacyConfig;
  api: ApiConfig;
  features: FeatureConfig;
  dlp: DlpConfig;
};

/**
 * A clipboard sample the agent decided is worth reporting: it changed since the
 * last poll, and capture is enabled. `text` is present only in full-content mode
 * and only when the sample is within `maxClipboardBytes`; the hash and size are
 * always present so an oversized or metadata-only sample is still evidence of
 * *that a copy happened*, from where, without the content itself.
 */
export type ClipboardCaptureEvent = {
  sessionId: string;
  deviceId: string;
  occurredAt: string;
  sourceApp: string | null;
  sourceAppPath: string | null;
  contentBytes: number;
  contentSha256: string;
  text: string | null;
  firedRuleId: string | null;
  agentVersion: string;
  /**
   * Idempotency key: one clipboard sample is one instant in one session. The API
   * makes this column uniquely indexed so a replayed batch — the offline queue
   * re-sends whole batches — records each sample exactly once (the BUG-0036
   * lesson, applied before the send path exists rather than after).
   */
  dedupeKey: string;
};

/**
 * A screenshot the agent captured because a DLP rule fired. Never taken on a
 * timer — only in response to a `DlpTrigger` — and the raw bytes ride separately
 * (base64) so this metadata row can be logged while the image never is.
 */
export type ScreenCaptureEvent = {
  sessionId: string;
  deviceId: string;
  occurredAt: string;
  firedRuleId: string;
  capturedReason: string;
  contentBytes: number;
  contentSha256: string;
  agentVersion: string;
  dedupeKey: string;
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

export type AgentDevicePermissionStatus =
  | "GRANTED"
  | "DENIED"
  | "PROMPT"
  | "RESTRICTED"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type AgentDevicePermissions = {
  cameraPermission: AgentDevicePermissionStatus;
  microphonePermission: AgentDevicePermissionStatus;
  locationPermission: AgentDevicePermissionStatus;
};

export type AgentLocationRequest = {
  id: string;
  status: string;
  requestedAt: string;
  promptedAt?: string | null;
  expiresAt: string;
  deviceId: string;
};

export type AgentLocationResult = {
  requestId: string;
  deviceId: string;
  status: "CAPTURED" | "DENIED" | "FAILED";
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  errorMessage?: string;
  capturedAt?: string;
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
