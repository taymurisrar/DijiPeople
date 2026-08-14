import type { ZkConfig } from '../config';
import { runWorker, type WorkerResult, type WorkerRunOptions } from '../device/legacy-worker';
import type { Logger } from '../logger';
import type { AttendanceDeviceInfo, DeviceClockReading } from '../types';
import { driftSeconds, parseLocalWallClock, toLocalWallClock } from '../util/time';

export interface CommandContext {
  config: ZkConfig;
  logger: Logger;
}

/**
 * Runs one worker session. Every command goes through here so the device is
 * always opened and closed exactly once per invocation.
 */
export async function runSession(
  context: CommandContext,
  options: WorkerRunOptions = {},
): Promise<WorkerResult> {
  return runWorker(context.config, context.logger, options);
}

/** Projects the worker's device block onto the POC's normalised shape. */
export function toDeviceInfo(result: WorkerResult, config: ZkConfig): AttendanceDeviceInfo {
  const device = result.device;

  return {
    manufacturer: device?.manufacturer ?? 'ZKTeco',
    ...(device?.model ? { model: device.model } : {}),
    ...(device?.serialNumber ? { serialNumber: device.serialNumber } : {}),
    ...(device?.firmwareVersion ? { firmwareVersion: device.firmwareVersion } : {}),
    ...(device?.platform ? { platform: device.platform } : {}),
    ...(device?.macAddress ? { macAddress: device.macAddress } : {}),
    machineNumber: device?.machineNumber ?? config.machineNumber,
    host: device?.host ?? config.host,
    port: device?.port ?? config.port,
    ...(device?.deviceTimeLocal ? { deviceTimeLocal: device.deviceTimeLocal } : {}),
    ...(device?.deviceStatusRaw ? { deviceStatusRaw: device.deviceStatusRaw } : {}),
    ...(device?.unavailableFields ? { unavailableFields: device.unavailableFields } : {}),
  };
}

/**
 * Compares the device clock with this host's clock.
 *
 * The device clock is never adjusted — the POC is read-only, and SetDeviceTime
 * is not on the worker's allowlist.
 */
export function readClock(info: AttendanceDeviceInfo, config: ZkConfig): DeviceClockReading {
  const systemTime = new Date();
  const deviceTime = parseLocalWallClock(info.deviceTimeLocal);

  if (!deviceTime) {
    return {
      systemTimeLocal: toLocalWallClock(systemTime),
      status: 'UNAVAILABLE',
      warnThresholdSeconds: config.clockDriftWarnSeconds,
    };
  }

  const drift = driftSeconds(deviceTime, systemTime);
  return {
    deviceTimeLocal: info.deviceTimeLocal as string,
    systemTimeLocal: toLocalWallClock(systemTime),
    driftSeconds: drift,
    status: Math.abs(drift) <= config.clockDriftWarnSeconds ? 'HEALTHY' : 'WARNING',
    warnThresholdSeconds: config.clockDriftWarnSeconds,
  };
}

export interface SerialCheck {
  matches: boolean;
  message?: string;
}

/**
 * The expected serial is a *check*, never a requirement — a device that reports
 * a different serial still completes the run, it just gets flagged so nobody
 * mistakes a lab unit's data for the customer's.
 */
export function checkExpectedSerial(info: AttendanceDeviceInfo, config: ZkConfig): SerialCheck {
  if (!config.expectedSerial) return { matches: true };

  const actual = info.serialNumber;
  if (!actual) {
    return {
      matches: false,
      message: `expected serial ${config.expectedSerial} but the device did not report one`,
    };
  }
  if (actual !== config.expectedSerial) {
    return {
      matches: false,
      message: `connected device serial is ${actual}, expected ${config.expectedSerial}`,
    };
  }
  return { matches: true };
}

/**
 * Serial number used to stamp normalised records. Falls back to a host-derived
 * placeholder so a device that hides its serial still produces usable output,
 * clearly marked as synthetic.
 */
export function resolveDeviceKey(info: AttendanceDeviceInfo): string {
  return info.serialNumber ?? `UNKNOWN-SERIAL@${info.host}:${info.port}`;
}
