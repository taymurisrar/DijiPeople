/**
 * Human-facing console report helpers. Kept separate from `logger.ts` so that
 * structured logs and the operator-facing summary never get tangled together.
 */

import type { Logger } from './logger';
import type {
  AttendanceDeviceInfo,
  DeviceClockReading,
  StepResult,
  WorkerRuntimeInfo,
} from './types';
import { formatCount, formatDuration } from './util/time';

const NOT_REPORTED = '(not reported by SDK)';

export function heading(logger: Logger, title: string): void {
  logger.print();
  logger.print(title);
  logger.print('='.repeat(title.length));
  logger.print();
}

export function keyValue(logger: Logger, rows: Array<[string, string]>, indent = ''): void {
  const width = rows.reduce((max, [label]) => Math.max(max, label.length), 0);
  for (const [label, value] of rows) {
    logger.print(`${indent}${label.padEnd(width)}  ${value}`);
  }
}

export function runtimeRows(
  runtime: WorkerRuntimeInfo | undefined,
  progId: string,
): Array<[string, string]> {
  return [
    ['Runtime', runtime ? (runtime.is64BitProcess ? 'x64 (WRONG)' : 'x86') : NOT_REPORTED],
    ['Process architecture', runtime?.processArchitecture ?? NOT_REPORTED],
    ['Framework', runtime?.framework ?? NOT_REPORTED],
    ['COM component', progId],
  ];
}

export function deviceInfoRows(info: AttendanceDeviceInfo): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Manufacturer', info.manufacturer],
    ['Model', info.model ?? NOT_REPORTED],
    ['Serial', info.serialNumber ?? NOT_REPORTED],
    // The SDK's firmware string is known to differ from the one on the device
    // UI. Both are reported as-is; neither is "corrected".
    [
      'Firmware (SDK)',
      info.firmwareVersion
        ? `${info.firmwareVersion}   [SDK value; the device UI may show a different version]`
        : NOT_REPORTED,
    ],
    ['Platform', info.platform ?? NOT_REPORTED],
    ['MAC', info.macAddress ?? NOT_REPORTED],
    [
      'Device time',
      info.deviceTimeLocal
        ? `${info.deviceTimeLocal}   [device-local wall clock, no timezone]`
        : NOT_REPORTED,
    ],
    ['Machine number', String(info.machineNumber)],
    ['Host / Port', `${info.host}:${info.port}`],
  ];

  if (info.deviceStatusRaw && Object.keys(info.deviceStatusRaw).length > 0) {
    const pairs = Object.entries(info.deviceStatusRaw)
      .map(([code, value]) => `${code}=${value}`)
      .join(' ');
    rows.push(['Device status (raw)', `${pairs}   [code meanings unverified]`]);
  }

  if (info.unavailableFields && info.unavailableFields.length > 0) {
    rows.push(['Unavailable metadata', info.unavailableFields.join(', ')]);
  }

  return rows;
}

export function printClock(logger: Logger, clock: DeviceClockReading): void {
  if (clock.status === 'UNAVAILABLE') {
    keyValue(logger, [
      ['Device time', NOT_REPORTED],
      ['System time', clock.systemTimeLocal],
      ['Status', 'UNAVAILABLE'],
    ]);
    return;
  }

  keyValue(logger, [
    ['Device time', clock.deviceTimeLocal ?? '-'],
    ['System time', clock.systemTimeLocal],
    [
      'Clock drift',
      `${clock.driftSeconds ?? 0} seconds (threshold ${clock.warnThresholdSeconds}s)`,
    ],
    ['Status', clock.status],
  ]);
}

export function printSteps(logger: Logger, steps: readonly StepResult[]): void {
  const width = steps.reduce((max, step) => Math.max(max, step.name.length), 0);
  for (const step of steps) {
    const timing = step.durationMs === undefined ? '' : `  (${formatDuration(step.durationMs)})`;
    const detail = step.detail ? `  ${step.detail}` : '';
    logger.print(`${step.name.padEnd(width)}  ${step.status.padEnd(4)}${timing}${detail}`);
  }
}

export function printCount(logger: Logger, label: string, value: number): void {
  logger.print(`${label}: ${formatCount(value)}`);
}

/**
 * A run is a PASS only when every step passed. WARN steps (clock drift, an
 * unexpected serial number) do not fail the run but are reported.
 */
export function overallStatus(
  steps: readonly StepResult[],
): 'PASS' | 'FAIL' | 'PASS_WITH_WARNINGS' {
  if (steps.some((step) => step.status === 'FAIL')) return 'FAIL';
  if (steps.some((step) => step.status === 'WARN')) return 'PASS_WITH_WARNINGS';
  return 'PASS';
}
