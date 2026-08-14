/**
 * Bridge to the x86 ZKTeco legacy worker.
 *
 * The COM component is 32-bit only, so it cannot be loaded into this 64-bit Node
 * process. Instead a short-lived x86 child process does the device work and
 * returns one JSON document. That keeps the architecture constraint contained:
 * only the worker is x86, everything else in DijiPeople stays neutral.
 *
 * The child owns the whole session — connect, read, disconnect, release COM —
 * so there is no way for this side to leave a device connection open.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';

import type { ZkConfig } from '../config';
import { ZkPocError, describeThrown } from '../errors';
import type { Logger } from '../logger';
import type {
  LatestLogProbeResult,
  SdkCapabilities,
  WorkerComInfo,
  WorkerConnectionInfo,
  WorkerRuntimeInfo,
} from '../types';

/** Must match `WorkerResult.ContractVersion` in the worker. */
export const EXPECTED_CONTRACT_VERSION = 1;

/** Raw device info exactly as the worker reports it. */
export interface WorkerDeviceInfo {
  manufacturer: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  platform?: string;
  macAddress?: string;
  machineNumber: number;
  host: string;
  port: number;
  deviceTimeLocal?: string;
  deviceStatusRaw?: Record<string, number>;
  unavailableFields?: string[];
}

export interface WorkerRawUser {
  externalUserId: string;
  name?: string;
  privilegeRaw?: number;
  enabled?: boolean;
}

export interface WorkerRawPunch {
  externalUserId: string;
  occurredAtLocal: string;
  verificationModeRaw?: number;
  punchStateRaw?: number;
  workCodeRaw?: number;
}

export interface WorkerResult {
  contractVersion: number;
  runtime: WorkerRuntimeInfo;
  com: WorkerComInfo;
  connection?: WorkerConnectionInfo;
  device?: WorkerDeviceInfo;
  users?: WorkerRawUser[];
  attendance?: WorkerRawPunch[];
  capabilities?: SdkCapabilities;
  latestLogProbe?: LatestLogProbeResult;
  diagnostics?: string[];
  error?: {
    code: string;
    message: string;
    hResult?: string;
    sdkErrorCode?: number;
  };
}

export interface WorkerRunOptions {
  skipUsers?: boolean;
  skipAttendance?: boolean;
  skipCapabilities?: boolean;
  /**
   * Opt-in experiment. Only `commands/probe-latest-log.ts` sets this, and only
   * after the operator has passed an explicit acknowledgement flag.
   */
  probeLatestLog?: boolean;
  probeLimit?: number;
}

/** Remediation shown for connection-class failures. */
const CONNECTION_REMEDIATION = [
  'device is powered on and reachable: Test-NetConnection <host> -Port 4370',
  'the host/port/machine number in .env match the device',
  'the Comm Key on the device matches ZK_COMM_KEY (0 on the reference K50)',
  'no other application is holding the device (see the V2011 concurrency test in the README)',
];

const SDK_REMEDIATION = [
  'zkemkeeper must be registered on THIS machine: regsvr32 C:\\Windows\\SysWOW64\\zkemkeeper.dll (elevated)',
  'confirm the ProgID resolves: HKEY_CLASSES_ROOT\\WOW6432Node\\CLSID\\{00853A19-BD51-419B-9269-2DABE57EB61F}',
  'the worker must run as x86 — a 64-bit process reports 0x80040154 "Class not registered"',
];

/**
 * Maps a worker error code onto a POC error with actionable guidance. Codes the
 * worker and the CLI share deliberately have the same names.
 */
function toPocError(error: NonNullable<WorkerResult['error']>): ZkPocError {
  const remediation =
    error.code === 'SDK_NOT_AVAILABLE' ||
    error.code === 'SDK_REGISTRATION_FAILED' ||
    error.code === 'ARCHITECTURE_MISMATCH'
      ? SDK_REMEDIATION
      : error.code === 'DEVICE_UNREACHABLE'
        ? CONNECTION_REMEDIATION
        : error.code === 'READ_USERS_FAILED' || error.code === 'READ_ATTENDANCE_FAILED'
          ? [
              'retry with the device idle and Fingerprint Attendance System V2011 closed',
              'a false return from ReadAllUserID / ReadGeneralLogData usually means the session was dropped mid-read',
            ]
          : [];

  const suffix = [
    error.hResult ? `HRESULT ${error.hResult}` : undefined,
    error.sdkErrorCode !== undefined ? `SDK error code ${error.sdkErrorCode}` : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return new ZkPocError(
    error.code,
    suffix ? `${error.message} (${suffix})` : error.message,
    { remediation },
  );
}

function resolveSpawn(config: ZkConfig): { command: string; prefixArgs: string[] } {
  const worker = config.workerPath;

  // A .js/.mjs worker path runs under this Node process. That exists so the
  // offline mock worker can stand in for the real x86 binary; the real worker is
  // always an .exe.
  if (['.js', '.mjs', '.cjs'].includes(extname(worker).toLowerCase())) {
    return { command: process.execPath, prefixArgs: [worker] };
  }

  return { command: worker, prefixArgs: [] };
}

function buildArgs(config: ZkConfig, options: WorkerRunOptions): string[] {
  const args = [
    // The worker prints a human report on stdout by default so it is usable
    // standalone on a customer machine. This CLI needs the machine contract, so
    // it always asks for JSON explicitly.
    '--json',
    '--host',
    config.host,
    '--port',
    String(config.port),
    '--machine-number',
    String(config.machineNumber),
    '--comm-key',
    String(config.commKey),
  ];

  if (options.skipUsers) args.push('--skip-users');
  if (options.skipAttendance) args.push('--skip-attendance');
  if (options.skipCapabilities) args.push('--skip-capabilities');

  if (options.probeLatestLog) {
    args.push('--probe-latest-log');
    if (options.probeLimit !== undefined) {
      args.push('--probe-limit', String(options.probeLimit));
    }
  }

  return args;
}

/** Arguments that are safe to log — the comm key value is never among them. */
function loggableArgs(config: ZkConfig, options: WorkerRunOptions): Record<string, unknown> {
  return {
    host: config.host,
    port: config.port,
    machineNumber: config.machineNumber,
    commKeyConfigured: config.commKey !== 0,
    skipUsers: Boolean(options.skipUsers),
    skipAttendance: Boolean(options.skipAttendance),
    skipCapabilities: Boolean(options.skipCapabilities),
    probeLatestLog: Boolean(options.probeLatestLog),
  };
}

/**
 * Runs the worker once and returns its parsed result.
 *
 * Throws a `ZkPocError` when the worker cannot be started, times out, produces
 * unparseable output, or reports an error of its own.
 */
export async function runWorker(
  config: ZkConfig,
  logger: Logger,
  options: WorkerRunOptions = {},
): Promise<WorkerResult> {
  if (!existsSync(config.workerPath)) {
    throw new ZkPocError(
      'SDK_NOT_AVAILABLE',
      `The x86 worker was not found at ${config.workerPath}.`,
      {
        remediation: [
          'build it: npm run worker:publish (from tools/zkteco-poc)',
          'or point ZK_WORKER_PATH at an existing DijiPeople.ZkTeco.Worker.exe',
        ],
      },
    );
  }

  const { command, prefixArgs } = resolveSpawn(config);
  const args = [...prefixArgs, ...buildArgs(config, options)];

  logger.info('worker.run.requested', {
    worker: config.workerPath,
    timeoutMs: config.workerTimeoutMs,
    ...loggableArgs(config, options),
  });

  const startedAt = Date.now();

  const { stdout, stderr, exitCode, timedOut, spawnError } = await new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
    spawnError?: unknown;
  }>((resolve) => {
    const child = spawn(command, args, { windowsHide: true });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let finished = false;
    let killedForTimeout = false;

    const timer = setTimeout(() => {
      killedForTimeout = true;
      child.kill();
    }, config.workerTimeoutMs);

    const settle = (payload: {
      exitCode: number | null;
      spawnError?: unknown;
    }): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
        exitCode: payload.exitCode,
        timedOut: killedForTimeout,
        ...(payload.spawnError !== undefined ? { spawnError: payload.spawnError } : {}),
      });
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrBuffer += chunk;
      // The worker's stderr is its trace channel; keep it at debug level.
      for (const line of chunk.split(/\r?\n/)) {
        if (line.trim()) logger.debug('worker.stderr', { line: line.trim() });
      }
    });

    child.on('error', (err) => settle({ exitCode: null, spawnError: err }));
    child.on('close', (code) => settle({ exitCode: code }));
  });

  const durationMs = Date.now() - startedAt;

  if (spawnError) {
    throw new ZkPocError(
      'SDK_NOT_AVAILABLE',
      `Could not start the x86 worker (${config.workerPath}): ${describeThrown(spawnError).message}`,
      { remediation: ['run npm run worker:publish', ...SDK_REMEDIATION], cause: spawnError },
    );
  }

  if (timedOut) {
    throw new ZkPocError(
      'CONNECTION_TIMEOUT',
      `The x86 worker did not finish within ${config.workerTimeoutMs} ms and was terminated.`,
      {
        remediation: [
          'raise ZK_WORKER_TIMEOUT_MS — a full historical attendance download can take minutes',
          ...CONNECTION_REMEDIATION,
        ],
      },
    );
  }

  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new ZkPocError(
      'UNKNOWN_ERROR',
      `The x86 worker exited with code ${exitCode ?? 'null'} without producing any output.`,
      {
        remediation: [
          're-run with --log-level debug to see the worker trace',
          stderr.trim() ? `worker stderr: ${stderr.trim().split(/\r?\n/).slice(-3).join(' | ')}` : 'worker produced no stderr either',
        ],
      },
    );
  }

  let parsed: WorkerResult;
  try {
    parsed = JSON.parse(trimmed) as WorkerResult;
  } catch (thrown) {
    throw new ZkPocError(
      'UNKNOWN_ERROR',
      `The x86 worker produced output that is not valid JSON: ${describeThrown(thrown).message}`,
      {
        remediation: ['re-run with --log-level debug and inspect the raw worker output'],
        cause: thrown,
      },
    );
  }

  if (parsed.contractVersion !== EXPECTED_CONTRACT_VERSION) {
    throw new ZkPocError(
      'UNSUPPORTED_DEVICE',
      `Worker contract version ${parsed.contractVersion} does not match the ${EXPECTED_CONTRACT_VERSION} this CLI expects.`,
      { remediation: ['rebuild the worker: npm run worker:publish'] },
    );
  }

  logger.info('worker.run.completed', {
    durationMs,
    exitCode,
    processArchitecture: parsed.runtime?.processArchitecture,
    comInstantiated: parsed.com?.instantiated,
    connectDurationMs: parsed.connection?.connectDurationMs,
    users: parsed.users?.length,
    attendance: parsed.attendance?.length,
  });

  for (const line of parsed.diagnostics ?? []) {
    logger.debug('worker.diagnostic', { message: line });
  }

  // x86 is checked on both sides: the worker refuses to run 64-bit, and the CLI
  // refuses to trust a result that claims otherwise.
  if (parsed.runtime?.is64BitProcess) {
    throw new ZkPocError(
      'ARCHITECTURE_MISMATCH',
      'The worker reported a 64-bit process. zkemkeeper is a 32-bit COM component and requires x86.',
      { remediation: SDK_REMEDIATION },
    );
  }

  if (parsed.error) {
    throw toPocError(parsed.error);
  }

  return parsed;
}
