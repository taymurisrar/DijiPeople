/**
 * Shapes returned by the attendance integration APIs.
 *
 * Mirrors what the API actually sends rather than the Prisma models, so the UI
 * cannot accidentally depend on a field the API deliberately withholds — most
 * importantly connector secrets, which never leave the server in plaintext.
 */

export type IntegrationStatus =
  | "DRAFT"
  | "UNVERIFIED"
  | "ACTIVE"
  | "DISABLED"
  | "ERROR";

export type ConnectionMode =
  | "LOCAL_GATEWAY"
  | "DEVICE_PUSH"
  | "CLOUD_API"
  | "VENDOR_SERVER"
  | "DATABASE"
  | "FILE_IMPORT";

export type IntegrationSummary = {
  id: string;
  name: string;
  code: string | null;
  provider: string;
  connectorType: string;
  connectionMode: ConnectionMode;
  status: IntegrationStatus;
  isActive: boolean;
  gateway: { id: string; name: string; status: string } | null;
  syncPolicy: { id: string; name: string } | null;
  deviceCount: number;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
};

/**
 * Readiness is four independent facts, not one status. They fail separately and
 * an administrator needs to know which one is wrong.
 */
export type IntegrationReadiness = {
  configurationValid: boolean;
  gatewayAvailable: boolean;
  /**
   * True once a gateway has reached an enabled device and the terminal answered
   * with the expected identity. A device that answered with the wrong serial
   * does NOT count — it is reachable and wrong, which is worse than untested.
   */
  deviceVerified: boolean;
  enabledDeviceCount: number;
  /** Enabled devices whose last live check succeeded. Absent on older responses. */
  verifiedDeviceCount?: number;
  blockers: string[];
};

/** Presence metadata for a secret. The value itself is never sent. */
export type SecretState = {
  configured: boolean;
  masked: string | null;
};

export type IntegrationDetail = IntegrationSummary & {
  description: string | null;
  configuration: Record<string, unknown>;
  secrets: Record<string, SecretState>;
  readiness: IntegrationReadiness;
};

export type IntegrationListResponse = {
  items: IntegrationSummary[];
  page: number;
  pageSize: number;
  total: number;
};

export type ConnectorFieldType =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "timezone"
  | "secret";

export type ConnectorField = {
  key: string;
  label: string;
  type: ConnectorFieldType;
  required: boolean;
  secret: boolean;
  helpText?: string;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
};

export type ConnectorSummary = {
  connectorType: string;
  provider: string;
  connectionMode: ConnectionMode;
  displayName: string;
  description: string;
  requiresGateway: boolean;
  supportsMultipleDevices: boolean;
  capabilities: string[];
  experimentalCapabilities: Array<{ capability: string; reason: string }>;
  automaticallySupportedCapabilities: string[];
  recommendedSync: {
    mode: string;
    recommendedIntervalValue: number;
    recommendedIntervalUnit: string;
    minimumIntervalMinutes: number;
    rationale?: string;
  };
  notes: string[];
};

export type ConnectorDetail = ConnectorSummary & {
  configurationSchema: { fields: ConnectorField[] };
};

export type SyncPolicySummary = {
  id: string;
  name: string;
  mode: string;
  intervalValue: number | null;
  intervalUnit: string;
  isActive: boolean;
};

export type GatewaySummary = {
  id: string;
  name: string;
  status: string;
  isPaired: boolean;
  lastHeartbeatAt: string | null;
};

export type ValidationResult = IntegrationReadiness & {
  liveConnectionTest: string;
  liveConnectionTestReason: string;
};

/** Field-level errors returned by the API's validation responses. */
export type ApiFieldError = { field: string; message: string };

// --- Devices ---------------------------------------------------------------

export type DeviceStatus = "PENDING" | "ACTIVE" | "DISABLED" | "DECOMMISSIONED";
export type DeviceHealth = "UNKNOWN" | "HEALTHY" | "DEGRADED" | "UNREACHABLE";
export type DirectionMode = "BOTH" | "ENTRY" | "EXIT";

/**
 * Whether a gateway has reached this terminal and what it found.
 *
 * SERIAL_MISMATCH is its own state, not a flavour of FAILED: a terminal that
 * answers with the wrong serial is reachable and wrong, which is a configuration
 * problem rather than a connectivity one and needs a different fix.
 */
export type DeviceVerificationStatus =
  | "UNVERIFIED"
  | "VERIFIED"
  | "FAILED"
  | "SERIAL_MISMATCH";

export type DeviceSummary = {
  id: string;
  name: string;
  code: string | null;
  provider: string;
  model: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  host: string | null;
  port: number | null;
  machineNumber: number | null;
  timezone: string | null;
  directionMode: DirectionMode;
  status: DeviceStatus;
  isEnabled: boolean;
  healthStatus: DeviceHealth;
  healthMessage: string | null;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  /** Live verification recorded by the gateway runtime. */
  verificationStatus?: DeviceVerificationStatus;
  lastVerifiedAt?: string | null;
  lastVerificationError?: string | null;
  /**
   * The serial the terminal actually reported, alongside the configured one.
   * Both are shown: a difference between them is a configuration fault worth
   * seeing, not something to reconcile silently.
   */
  actualSerialNumber?: string | null;
  serialMatches?: boolean | null;
  /** Device wall clock as reported. No timezone is implied. */
  lastDeviceTimeLocal?: string | null;
  lastClockDriftSeconds?: number | null;
  syncRequestedAt?: string | null;
  /** True while a manual sync is waiting for the gateway to pick it up. */
  syncRequestPending?: boolean;
  integration: { id: string; name: string; connectorType: string } | null;
  workSite: { id: string; name: string } | null;
  gateway: { id: string; name: string; status: string } | null;
  scopeCount: number;
};

export type DeviceDetail = DeviceSummary & {
  configuration: Record<string, unknown>;
  capabilities: unknown;
};

export type DeviceListResponse = {
  items: DeviceSummary[];
  page: number;
  pageSize: number;
  total: number;
};

export type DeviceScopeType =
  | "TENANT"
  | "ORGANIZATION"
  | "BUSINESS_UNIT"
  | "DEPARTMENT"
  | "TEAM"
  | "EMPLOYEE";

export type DeviceScope = {
  id: string;
  scopeType: DeviceScopeType;
  organizationId: string | null;
  businessUnitId: string | null;
  departmentId: string | null;
  teamId: string | null;
  employeeId: string | null;
  isAllowed: boolean;
  createdAt: string;
};

export type DeviceScopesResponse = {
  items: DeviceScope[];
  defaultBehaviour: string;
};

// --- External device users / mapping ---------------------------------------

export type MappingStatus =
  | "MATCHED"
  | "UNMATCHED"
  | "IGNORED"
  | "CONFLICT"
  | "INACTIVE";

export type ExternalDeviceUser = {
  id: string;
  externalUserId: string;
  externalName: string | null;
  externalEmployeeCode: string | null;
  provider: string;
  privilegeRaw: number | null;
  isEnabledOnDevice: boolean | null;
  mappingStatus: MappingStatus;
  mappedEmployeeId: string | null;
  matchReason: string | null;
  conflictReason: string | null;
  firstSeenAt: string;
  lastSeenAt: string | null;
  integration: { id: string; name: string } | null;
  device: { id: string; name: string } | null;
  mappedEmployee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
  } | null;
};

export type ExternalUserListResponse = {
  items: ExternalDeviceUser[];
  page: number;
  pageSize: number;
  total: number;
};

export type MatchStrategy =
  | "EXISTING_IDENTITY"
  | "EMPLOYEE_CODE"
  | "EXTERNAL_EMPLOYEE_CODE"
  | "EMAIL"
  | "NAME_SUGGESTION";

export type MatchConfidence = "CONFIRMED" | "HIGH" | "SUGGESTION" | "NONE";

export type MatchCandidate = {
  employeeId: string;
  employeeCode: string;
  displayName: string;
  strategy: MatchStrategy;
  confidence: MatchConfidence;
  reason: string;
};

export type MatchResult = {
  externalUserId: string;
  autoMatch: MatchCandidate | null;
  suggestions: MatchCandidate[];
  conflict: boolean;
  conflictReason?: string;
};

// --- Provisioning ----------------------------------------------------------

export type ProvisioningStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "RETRYING"
  | "CANCELLED";

export type ProvisioningOperation =
  | "CREATE_USER"
  | "UPDATE_USER"
  | "ENABLE_USER"
  | "DISABLE_USER";

export type ProvisioningJob = {
  id: string;
  operation: ProvisioningOperation;
  status: ProvisioningStatus;
  attemptCount: number;
  maxAttempts: number;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  nextRetryAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
  } | null;
  device: { id: string; name: string } | null;
};

export type ProvisioningListResponse = {
  items: ProvisioningJob[];
  page: number;
  pageSize: number;
  total: number;
};

// --- Gateways --------------------------------------------------------------

export type GatewayStatus =
  | "PENDING"
  | "ONLINE"
  | "OFFLINE"
  | "DEGRADED"
  | "REVOKED";

export type GatewayDetail = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  status: GatewayStatus;
  recordedStatus: GatewayStatus;
  version: string | null;
  platform: string | null;
  architecture: string | null;
  lastHeartbeatAt: string | null;
  registeredAt: string | null;
  revokedAt: string | null;
  integrationCount: number;
  deviceCount: number;
  isPaired: boolean;
  credentials?: Array<{
    id: string;
    tokenPrefix: string;
    label: string | null;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }>;
};

export type GatewayListResponse = {
  items: GatewayDetail[];
  page: number;
  pageSize: number;
  total: number;
};

// --- Integration runs ------------------------------------------------------

export type RunStatus =
  | "RUNNING"
  | "SUCCEEDED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export type RunType =
  | "ATTENDANCE_PULL"
  | "USER_DISCOVERY"
  | "USER_PROVISION"
  | "HEALTH_CHECK"
  | "MANUAL_SYNC";

export type IntegrationRun = {
  id: string;
  runType: RunType;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  recordsRead: number;
  recordsNew: number;
  recordsDuplicate: number;
  recordsMapped: number;
  recordsUnmapped: number;
  recordsFailed: number;
  errorCode: string | null;
  errorMessage: string | null;
  integration: { id: string; name: string } | null;
  gateway: { id: string; name: string } | null;
  device: { id: string; name: string } | null;
};

export type RunListResponse = {
  items: IntegrationRun[];
  page: number;
  pageSize: number;
  total: number;
};

// --- Application releases --------------------------------------------------

export type ApplicationRelease = {
  id: string;
  appKey: string;
  name: string;
  description: string | null;
  version: string;
  platform: "WINDOWS" | "MACOS" | "LINUX";
  architecture: "X64" | "X86" | "ARM64";
  channel: "STABLE" | "BETA" | "INTERNAL";
  fileName: string | null;
  fileSizeBytes: number | null;
  checksumSha256: string | null;
  minimumSupportedVersion: string | null;
  releaseNotes: string | null;
  isActive: boolean;
  publishedAt: string | null;
  /** Route on this app; never a storage URL. */
  downloadPath: string;
};

// --- Employee work sites ---------------------------------------------------

export type EmployeeWorkSiteAssignment = {
  id: string;
  locationId: string;
  isPrimary: boolean;
  status: "ACTIVE" | "INACTIVE";
  validFrom: string | null;
  validTo: string | null;
  location: { id: string; name: string; isActive: boolean };
};

export type AuthorizedWorkSite = {
  locationId: string;
  name: string;
  isPrimary: boolean;
  /**
   * True when the site comes from `Employee.locationId` rather than an explicit
   * assignment. Worth showing: it tells an administrator the authorisation is
   * inherited and would disappear the moment a real assignment is added.
   */
  derivedFromPrimaryLocation: boolean;
  validFrom: string | null;
  validTo: string | null;
};

export type EmployeeWorkSitesResponse = {
  employeeId: string;
  primaryLocationId: string | null;
  authorized: AuthorizedWorkSite[];
  assignments: EmployeeWorkSiteAssignment[];
};

/**
 * One link between a device user and an employee.
 *
 * Superseded entries are kept, never deleted — attendance already collected
 * must stay attributable to whoever it was attributed to at the time.
 */
export type MappingHistoryEntry = {
  id: string;
  provider: string;
  externalUserId: string;
  status: "ACTIVE" | "SUPERSEDED" | "REVOKED";
  validFrom: string | null;
  validTo: string | null;
  mappingSource: string | null;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
  } | null;
  device: { id: string; name: string } | null;
};
