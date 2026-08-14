/**
 * Configuration resolution for the POC.
 *
 * Precedence: CLI flag > process env > `<tool>/.env` > default.
 * Nothing about the customer's K50 is hard-coded — `ZK_DEVICE_HOST` is required
 * and every other value has a neutral default. The comm key is read but never
 * printed, logged or written to output.
 */

import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

import { ZkPocError } from './errors';
import { LOG_LEVELS, type LogFormat, type LogLevel } from './logger';

export interface ZkConfig {
  host: string;
  port: number;
  /** Device / machine ID passed as dwMachineNumber to every SDK call. */
  machineNumber: number;
  /** Never logged, never written to output. 0 means "no comm key". */
  commKey: number;
  expectedSerial?: string;
  clockDriftWarnSeconds: number;
  /** Absolute path to the x86 worker executable (or a .js mock worker). */
  workerPath: string;
  workerTimeoutMs: number;
  outputDir: string;
  writeOutput: boolean;
  logLevel: LogLevel;
  logFormat: LogFormat;
  /** Cap on normalised punches written to disk. 0 = write everything. */
  attendanceLimit: number;
  /**
   * Explicit operator acknowledgement required by `probe-latest-log`. Only that
   * command reads it; no other code path can enable an experimental SDK call.
   */
  confirmReadOnly: boolean;
  /** `capabilities --method <substring>`: narrows the signature dump. */
  methodFilter?: string;
}

export interface CliInvocation {
  command: string;
  flags: Map<string, string | boolean>;
}

const PACKAGE_ROOT = resolve(__dirname, '..');

const DEFAULT_WORKER_PATH = resolve(
  PACKAGE_ROOT,
  'worker',
  'publish',
  'DijiPeople.ZkTeco.Worker.exe',
);

export function loadEnvFile(): string | undefined {
  const envPath = resolve(PACKAGE_ROOT, '.env');
  if (!existsSync(envPath)) return undefined;
  loadDotenv({ path: envPath });
  return envPath;
}

export function parseCli(argv: string[]): CliInvocation {
  const [rawCommand, ...rest] = argv;
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token || !token.startsWith('--')) continue;

    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      flags.set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }

    const next = rest[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(body, next);
      index += 1;
    } else {
      flags.set(body, true);
    }
  }

  return { command: rawCommand && !rawCommand.startsWith('--') ? rawCommand : 'help', flags };
}

interface FieldIssue {
  field: string;
  problem: string;
}

function readString(
  flags: Map<string, string | boolean>,
  flagName: string,
  envName: string,
): string | undefined {
  const flagValue = flags.get(flagName);
  if (typeof flagValue === 'string' && flagValue.trim().length > 0) return flagValue.trim();
  const envValue = process.env[envName];
  if (typeof envValue === 'string' && envValue.trim().length > 0) return envValue.trim();
  return undefined;
}

function readInteger(
  flags: Map<string, string | boolean>,
  flagName: string,
  envName: string,
  fallback: number,
  bounds: { min: number; max: number },
  issues: FieldIssue[],
): number {
  const raw = readString(flags, flagName, envName);
  if (raw === undefined) return fallback;

  if (!/^-?\d+$/.test(raw)) {
    issues.push({ field: envName, problem: `expected an integer, got "${raw}"` });
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (parsed < bounds.min || parsed > bounds.max) {
    issues.push({
      field: envName,
      problem: `must be between ${bounds.min} and ${bounds.max}, got ${parsed}`,
    });
    return fallback;
  }
  return parsed;
}

export function resolveConfig(invocation: CliInvocation): ZkConfig {
  const { flags } = invocation;
  const issues: FieldIssue[] = [];

  const host = readString(flags, 'host', 'ZK_DEVICE_HOST');
  if (!host) {
    issues.push({
      field: 'ZK_DEVICE_HOST',
      problem: 'is required (set it in tools/zkteco-poc/.env or pass --host)',
    });
  }

  const port = readInteger(flags, 'port', 'ZK_DEVICE_PORT', 4370, { min: 1, max: 65535 }, issues);
  const machineNumber = readInteger(
    flags,
    'device-id',
    'ZK_DEVICE_ID',
    1,
    { min: 0, max: 255 },
    issues,
  );
  const commKey = readInteger(flags, 'comm-key', 'ZK_COMM_KEY', 0, { min: 0, max: 999999 }, issues);
  const clockDriftWarnSeconds = readInteger(
    flags,
    'clock-drift-warn-seconds',
    'ZK_CLOCK_DRIFT_WARN_SECONDS',
    60,
    { min: 1, max: 86_400 },
    issues,
  );
  const workerTimeoutMs = readInteger(
    flags,
    'worker-timeout',
    'ZK_WORKER_TIMEOUT_MS',
    300_000,
    { min: 5_000, max: 3_600_000 },
    issues,
  );
  const attendanceLimit = readInteger(
    flags,
    'limit',
    'ZK_ATTENDANCE_LIMIT',
    0,
    { min: 0, max: 5_000_000 },
    issues,
  );

  const rawLogLevel = (readString(flags, 'log-level', 'ZK_LOG_LEVEL') ?? 'info').toLowerCase();
  if (!(LOG_LEVELS as readonly string[]).includes(rawLogLevel)) {
    issues.push({
      field: 'ZK_LOG_LEVEL',
      problem: `must be one of ${LOG_LEVELS.join(', ')}, got "${rawLogLevel}"`,
    });
  }

  const rawLogFormat = (readString(flags, 'log-format', 'ZK_LOG_FORMAT') ?? 'pretty').toLowerCase();
  if (rawLogFormat !== 'pretty' && rawLogFormat !== 'json') {
    issues.push({
      field: 'ZK_LOG_FORMAT',
      problem: `must be "pretty" or "json", got "${rawLogFormat}"`,
    });
  }

  const rawOutputDir = readString(flags, 'output-dir', 'ZK_OUTPUT_DIR') ?? './output';
  const outputDir = isAbsolute(rawOutputDir) ? rawOutputDir : resolve(PACKAGE_ROOT, rawOutputDir);

  const rawWorkerPath = readString(flags, 'worker-path', 'ZK_WORKER_PATH');
  const workerPath = rawWorkerPath
    ? isAbsolute(rawWorkerPath)
      ? rawWorkerPath
      : resolve(PACKAGE_ROOT, rawWorkerPath)
    : DEFAULT_WORKER_PATH;

  const expectedSerial = readString(flags, 'expected-serial', 'ZK_EXPECTED_SERIAL');

  if (issues.length > 0) {
    throw new ZkPocError(
      'CONFIG_INVALID',
      `Device configuration is invalid:\n${issues
        .map((issue) => `  - ${issue.field} ${issue.problem}`)
        .join('\n')}`,
      {
        remediation: [
          'copy tools/zkteco-poc/.env.example to tools/zkteco-poc/.env and fill it in',
          'or pass the values as flags, e.g. --host 192.168.18.53 --port 4370',
        ],
      },
    );
  }

  return {
    host: host as string,
    port,
    machineNumber,
    commKey,
    ...(expectedSerial ? { expectedSerial } : {}),
    clockDriftWarnSeconds,
    workerPath,
    workerTimeoutMs,
    outputDir,
    writeOutput: flags.get('no-write') !== true,
    logLevel: rawLogLevel as LogLevel,
    logFormat: rawLogFormat as LogFormat,
    attendanceLimit,
    // Deliberately flag-only: there is no environment variable for this, so a
    // stale .env can never silently unlock an experimental device call.
    confirmReadOnly: flags.get('confirm-read-only') === true,
    ...(typeof flags.get('method') === 'string' ? { methodFilter: flags.get('method') as string } : {}),
  };
}

/**
 * Config summary that is safe to print. `commKey` is reduced to a boolean — the
 * value itself never leaves this process.
 */
export function describeConfig(config: ZkConfig): Record<string, unknown> {
  return {
    host: config.host,
    port: config.port,
    machineNumber: config.machineNumber,
    commKeyConfigured: config.commKey !== 0,
    expectedSerial: config.expectedSerial ?? '(not set)',
    worker: config.workerPath,
    outputDir: config.writeOutput ? config.outputDir : '(disabled)',
  };
}
