/**
 * Normalised shapes produced by the POC.
 *
 * These live only inside the POC. Nothing here is a Prisma model, a DTO or a
 * contract with the DijiPeople Attendance module — the production integration is
 * a later phase and will define its own persistence types.
 *
 * Raw device values (`verificationModeRaw`, `punchStateRaw`, `workCodeRaw`,
 * `privilegeRaw`) are carried through verbatim. The POC deliberately assigns no
 * meaning to them: the semantics of this firmware's Verify/State codes have not
 * been verified, and labelling them now would bake a guess into the data.
 */

export const PUNCH_SOURCE = 'ZKTECO_LEGACY' as const;
export type PunchSource = typeof PUNCH_SOURCE;

export const PUNCH_PROVIDER = 'ZKTECO' as const;
export type PunchProvider = typeof PUNCH_PROVIDER;

export interface AttendanceDeviceInfo {
  manufacturer: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  platform?: string;
  macAddress?: string;
  /** Device / machine ID passed to every SDK call. */
  machineNumber: number;
  host: string;
  port: number;
  /** Device wall clock, `YYYY-MM-DDTHH:mm:ss`. No timezone is implied. */
  deviceTimeLocal?: string;
  /**
   * Raw GetDeviceStatus values keyed by numeric status code. Meanings are NOT
   * asserted — see the SDK capability notes in the README.
   */
  deviceStatusRaw?: Record<string, number>;
  /** Optional metadata getters that the device did not answer. */
  unavailableFields?: string[];
}

export interface ExternalAttendanceUser {
  externalUserId: string;
  name?: string;
  privilegeRaw?: number;
  enabled?: boolean;
  source: PunchSource;
}

export interface RawAttendancePunch {
  provider: PunchProvider;

  deviceSerialNumber: string;
  machineNumber: number;

  externalUserId: string;

  /** Device wall clock, `YYYY-MM-DDTHH:mm:ss`. Deliberately offset-free. */
  occurredAtLocal: string;

  verificationModeRaw?: number;
  punchStateRaw?: number;
  workCodeRaw?: number;

  source: PunchSource;

  /** Deterministic dedupe candidate. See `normalize/fingerprint.ts`. */
  eventFingerprint: string;
}

export interface DeviceClockReading {
  deviceTimeLocal?: string;
  systemTimeLocal: string;
  driftSeconds?: number;
  status: 'HEALTHY' | 'WARNING' | 'UNAVAILABLE';
  warnThresholdSeconds: number;
}

/** Runtime facts reported by the x86 worker process. */
export interface WorkerRuntimeInfo {
  is64BitProcess: boolean;
  processArchitecture: string;
  framework: string;
  osVersion: string;
  is64BitOperatingSystem: boolean;
}

export interface WorkerComInfo {
  progId: string;
  clsid?: string;
  instantiated: boolean;
}

export interface WorkerConnectionInfo {
  host: string;
  port: number;
  machineNumber: number;
  connected: boolean;
  connectDurationMs: number;
  disconnected: boolean;
  commKeyApplied: boolean;
}

/** One parameter of an SDK method, as declared in the component's type library. */
export interface SdkParameter {
  position: number;
  name: string;
  type: string;
  /** `in`, `out`, `in/out` or `unspecified`, as declared in IDL. */
  direction: string;
  isOptional: boolean;
  hasDefault: boolean;
  isReturnValue: boolean;
  rawFlags: number;
}

/** One method as declared in the component's type library. */
export interface SdkMethodSignature {
  name: string;
  dispId: number;
  invokeKind: string;
  returnType: string;
  parameterCount: number;
  optionalParameterCount: number;
  funcFlags: number;
  helpString?: string;
  parameters: SdkParameter[];
  /** Rendered one-line declaration, for reports. */
  declaration: string;
}

/**
 * What the installed zkemkeeper actually exposes, read from its own type
 * information rather than from documentation.
 *
 * Type information describes a calling convention, not behaviour: it can prove
 * a method's signature but never that the method is free of device-side side
 * effects.
 */
export interface SdkCapabilities {
  typeInfoAvailable: boolean;
  methods: string[];
  signatures?: SdkMethodSignature[];
  /** Signatures of the methods under investigation for incremental retrieval. */
  targetSignatures?: SdkMethodSignature[];
  logRelatedMethods: string[];
  /** Methods whose names suggest read-marker / counter / clear machinery. Never called. */
  markerRelatedMethods?: string[];
  incrementalCandidates: Record<string, boolean>;
  probeError?: string;
}

/** Result of the opt-in ReadLastestLogData experiment. */
export interface LatestLogProbeResult {
  readMethod: string;
  getMethod: string;
  readSucceeded: boolean;
  recordLimit: number;
  recordsReturned: number;
  records: Array<{
    externalUserId: string;
    occurredAtLocal: string;
    verificationModeRaw?: number;
    punchStateRaw?: number;
    workCodeRaw?: number;
  }>;
  error?: string;
}

export type StepStatus = 'PASS' | 'FAIL' | 'SKIP' | 'WARN';

export interface StepResult {
  name: string;
  status: StepStatus;
  durationMs?: number;
  detail?: string;
}
